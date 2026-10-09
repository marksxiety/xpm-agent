import { win32, posix } from "node:path";
import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";
import { parseDurationMs } from "./duration";
import { ENV_KEY_PATTERN, isReservedEnvKey } from "./env-keys";
import { AGENT_NAME, AGENT_NAMESPACE } from "../pm2/cli";
import type { StartIssue, RuntimeProfile, EntrypointConvention, InspectCommand } from "../types/inspect"

type StartPayloadType = Static<typeof StartPayload>;

export interface InspectContext {
  /** Optional allowlist of absolute app roots the cwd must live under. */
  appRoots?: string[];
  /** The agent's own directory; a payload may not use it as cwd. */
  agentDir?: string;
}

const NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const NAMESPACE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isAbsoluteForTarget(p: string, targetOs: "win32" | "linux"): boolean {
  return targetOs === "win32" ? win32.isAbsolute(p) : posix.isAbsolute(p);
}

function pathApiFor(targetOs: "win32" | "linux") {
  return targetOs === "win32" ? win32 : posix;
}

function hasParentSegment(p: string): boolean {
  return p.split(/[\\/]+/).includes("..");
}

/** Normalizes for comparison: resolves, strips the Windows `\\?\` prefix, case-folds on win32. */
function normalizeForCompare(p: string, targetOs: "win32" | "linux"): string {
  const api = pathApiFor(targetOs);
  let normalized = api.resolve(p);
  if (targetOs === "win32") {
    normalized = normalized.replace(/^\\\\\?\\/, "").toLowerCase();
  }
  return normalized;
}

function isInsideDirectory(parent: string, child: string, targetOs: "win32" | "linux"): boolean {
  const api = pathApiFor(targetOs);
  const normalizedParent = normalizeForCompare(parent, targetOs);
  const normalizedChild = normalizeForCompare(child, targetOs);
  if (normalizedParent === normalizedChild) return true;
  const rel = api.relative(normalizedParent, normalizedChild);
  return rel !== "" && !rel.startsWith("..") && !api.isAbsolute(rel);
}

function isResolvedInside(parent: string, candidate: string, targetOs: "win32" | "linux"): boolean {
  const api = pathApiFor(targetOs);
  const resolved = api.isAbsolute(candidate) ? candidate : api.resolve(parent, candidate);
  return isInsideDirectory(parent, resolved, targetOs);
}

// ---------------------------------------------------------------------------
// Runtime profiles
//
// Each profile describes a language/runtime family: how to recognize it from
// either the interpreter executable or the script's file extension, and what
// PM2 features it supports. Adding a new runtime is a matter of adding an
// entry here — inspectStart() itself never references a specific language.
// ---------------------------------------------------------------------------
const RUNTIME_PROFILES: RuntimeProfile[] = [
  {
    id: "node",
    family: "node",
    executableNames: ["node"],
    scriptExtensions: /\.(?:m?js|cjs|ts|tsx|jsx|mts|cts)$/i,
    supportsInterpreterArgs: true,
  },
  {
    // Bun uses the same script extensions as Node but PM2's cluster mode is
    // Node-only (see ecosystem.config.js) — always fork.
    id: "bun",
    family: "node",
    executableNames: ["bun"],
    scriptExtensions: /\.(?:m?js|cjs|ts|tsx|jsx|mts|cts)$/i,
    supportsInterpreterArgs: true,
  },
  {
    id: "php",
    family: "php",
    executableNames: ["php"],
    scriptExtensions: /\.(?:php|phtml)$/i,
    supportsInterpreterArgs: false,
  },
  {
    id: "python",
    family: "python",
    executableNames: ["python", "python3", "py", "pythonw"],
    scriptExtensions: /\.pyw?$/i,
    supportsInterpreterArgs: true, // e.g. -O, -u
  },
  {
    id: "go",
    family: "go",
    executableNames: ["go"],
    scriptExtensions: /\.go$/i,
    supportsInterpreterArgs: false,
  },
];


// ---------------------------------------------------------------------------
// Entrypoint conventions
//
// Framework-specific entrypoint rules (artisan, manage.py, ...) are not
// runtime checks — they're naming conventions tied to a runtime by id.
// Keeping this table separate from RUNTIME_PROFILES means language support
// and framework convention support can evolve independently.
// ---------------------------------------------------------------------------

const ENTRYPOINT_CONVENTIONS: EntrypointConvention[] = [
  {
    matches: (scriptPath) => scriptPath.split(/[\\/]/).pop() === "artisan",
    requiredRuntimeId: "php",
    requiresArgs: true,
  },
  {
    matches: (scriptPath) => scriptPath.split(/[\\/]/).pop() === "manage.py",
    requiredRuntimeId: "python",
    requiresArgs: true,
  },
];


/**
 * Resolves the runtime profile for an interpreter executable path (or "none").
 * Used by the configuration guide and by describeProcessDetails to decide which
 * runtime-specific fields are meaningful.
 */
export function findInterpreterProfile(interpreter: string | undefined): RuntimeProfile | undefined {
  if (!interpreter || interpreter === "none") return undefined;
  const basename = (interpreter.split(/[\\/]/).pop() ?? interpreter).replace(/\.exe$/i, "").toLowerCase();
  return RUNTIME_PROFILES.find((profile) => profile.executableNames.includes(basename));
}

/** True for Node.js and Bun interpreters (the runtimes that report node metadata). */
export function isNodeFamilyInterpreter(interpreter: string | undefined): boolean {
  return findInterpreterProfile(interpreter)?.family === "node";
}

function parseArgTokens(raw: string | string[]): string[] {
  const tokens = Array.isArray(raw) ? raw : raw.split(/\s+/);
  return tokens.flatMap((token) => token.split(/\s+/)).filter((token) => token.length > 0);
}

/**
 * Per-runtime allowlist for interpreter flags. Everything else (e.g.
 * `--require`, `--import`, `-e`, `-c`) can execute code and is rejected.
 */
function interpreterArgIssue(
  raw: string | string[],
  profile: RuntimeProfile,
  cwd: string,
  targetOs: "win32" | "linux",
): StartIssue | undefined {
  const tokens = parseArgTokens(raw);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (profile.family === "node") {
      if (/^--max-old-space-size=\d+$/.test(token)) continue;
      if (token === "--env-file") {
        const value = tokens[index + 1];
        if (value !== undefined && isResolvedInside(cwd, value, targetOs)) {
          index += 1;
          continue;
        }
        return {
          field: "interpreter_args",
          message: "'--env-file' must point to a file inside cwd",
        };
      }
      const envFileMatch = /^--env-file=(.+)$/.exec(token);
      if (envFileMatch) {
        if (isResolvedInside(cwd, envFileMatch[1], targetOs)) continue;
        return {
          field: "interpreter_args",
          message: "'--env-file' must point to a file inside cwd",
        };
      }
      return {
        field: "interpreter_args",
        message: `interpreter flag '${token}' is not allowed — only '--max-old-space-size=<n>' and '--env-file' inside cwd are supported`,
      };
    }

    if (profile.family === "python" && ["-O", "-OO", "-u", "-B"].includes(token)) continue;

    return {
      field: "interpreter_args",
      message: `interpreter flag '${token}' is not allowed for ${profile.id}`,
    };
  }

  return undefined;
}

export function inspectStart(options: StartPayloadType, context: InspectContext = {}): StartIssue[] {
  const issues: StartIssue[] = [];
  const script = options.script ?? "";
  const interpreter = options.interpreter;
  const targetOs = options.targetOs ?? "win32";
  const namespace = options.namespace?.trim() || "default";
  const cwd = options.cwd;

  if (options.name?.trim() === "") {
    issues.push({
      field: "name",
      message: "name is required and cannot be empty",
    });
  } else if (options.name !== undefined && !NAME_PATTERN.test(options.name)) {
    issues.push({
      field: "name",
      message: `name must match ${NAME_PATTERN.source}`,
    });
  }

  if (script.trim() === "") {
    issues.push({
      field: "script",
      message: "script is required and cannot be empty",
    });
  } else if (/\s/.test(script)) {
    // PM2 turns a script containing spaces into `bash -c <script>` on POSIX
    // (node_modules/pm2/lib/Common.js verifyConfs), which is shell execution.
    issues.push({
      field: "script",
      message: "script must be a single path without whitespace",
    });
  }

  if (cwd === undefined || cwd.trim() === "") {
    issues.push({
      field: "cwd",
      message: "cwd is required and must be an absolute path",
    });
  } else if (!isAbsoluteForTarget(cwd, targetOs)) {
    issues.push({
      field: "cwd",
      message:
        targetOs === "win32"
          ? "cwd must be an absolute Windows path (e.g. 'C:\\apps\\my-service'), not a relative path — PM2 would resolve it against the agent's directory"
          : "cwd must be an absolute POSIX path (e.g. '/srv/apps/my-service'), not a relative path — PM2 would resolve it against the agent's directory",
    });
  } else if (hasParentSegment(cwd)) {
    issues.push({
      field: "cwd",
      message: "cwd must not contain '..' segments",
    });
  } else if (
    context.agentDir !== undefined &&
    normalizeForCompare(cwd, targetOs) === normalizeForCompare(context.agentDir, targetOs)
  ) {
    issues.push({
      field: "cwd",
      message: "cwd must not be the agent's own directory",
    });
  } else if (
    context.appRoots !== undefined &&
    context.appRoots.length > 0 &&
    !context.appRoots.some((root) => isInsideDirectory(root, cwd, targetOs))
  ) {
    issues.push({
      field: "cwd",
      message: "cwd must be inside one of the configured app roots",
    });
  }

  if (!NAMESPACE_PATTERN.test(namespace)) {
    issues.push({
      field: "namespace",
      message: `namespace must match ${NAMESPACE_PATTERN.source}`,
    });
  }

  if (AGENT_NAME.has(options.name?.toLowerCase() ?? "") && namespace.toUpperCase() === AGENT_NAMESPACE) {
    issues.push({
      field: "name",
      message: `'${options.name}' in namespace '${AGENT_NAMESPACE}' is reserved for the agent`,
    });
  }

  if (cwd !== undefined && cwd.trim() !== "" && isAbsoluteForTarget(cwd, targetOs) && script.trim() !== "" && !/\s/.test(script)) {
    if (!isResolvedInside(cwd, script, targetOs)) {
      issues.push({
        field: "script",
        message: "script must resolve inside cwd",
      });
    }
  }

  // The schema only accepts `"fork"`/`1`, but the controller can be called
  // directly, so re-check here: PM2 cluster workers fork from the daemon and
  // would inherit its environment instead of the payload env.
  const execMode = options.exec_mode as string | undefined;
  const instanceCount = options.instances as number | string | undefined;

  if (execMode !== undefined && execMode !== "fork") {
    issues.push({
      field: "exec_mode",
      message: "only 'fork' exec_mode is supported — cluster mode would inherit the daemon environment",
    });
  }

  if (instanceCount !== undefined && instanceCount !== 1) {
    issues.push({
      field: "instances",
      message: "instances must be 1 — cluster mode is disabled",
    });
  }

  if (options.min_uptime !== undefined && parseDurationMs(options.min_uptime) === undefined) {
    issues.push({
      field: "min_uptime",
      message:
        "min_uptime must be a number of milliseconds or a duration string like '10s', '500ms', '2m'",
    });
  }

  // Interpreter paths are validated against the OS the target process will
  // run on (targetOs), not the OS hosting this API.
  if (interpreter !== "none" && !isAbsoluteForTarget(interpreter, targetOs)) {
    issues.push({
      field: "interpreter",
      message:
        targetOs === "win32"
          ? "interpreter must be an absolute path to the executable (e.g. 'C:\\Program Files\\nodejs\\node.exe'), not a bare name like 'node' or 'py' — only 'none' is accepted as a bare value"
          : "interpreter must be an absolute path to the executable (e.g. '/usr/bin/node'), not a bare name like 'node' or 'py' — only 'none' is accepted as a bare value",
    });
  }

  const interpreterProfile = findInterpreterProfile(interpreter);

  if (interpreter !== "none" && interpreterProfile === undefined) {
    issues.push({
      field: "interpreter",
      message:
        "interpreter must be a recognized runtime executable (node, bun, php, python, go) or 'none'",
    });
  }

  const scriptProfile = RUNTIME_PROFILES.find((profile) => profile.scriptExtensions.test(script));

  if (scriptProfile && interpreterProfile && scriptProfile.family !== interpreterProfile.family) {
    issues.push({
      field: "interpreter",
      message: `script '${script}' looks like a ${scriptProfile.id} file — interpreter should be a ${scriptProfile.id} executable path`,
    });
  }

  if (options.interpreter_args !== undefined) {
    if (!interpreterProfile?.supportsInterpreterArgs) {
      issues.push({
        field: "interpreter_args",
        message: `'interpreter_args' isn't supported by this interpreter${interpreterProfile ? ` (${interpreterProfile.id})` : ""
          }`,
      });
    } else if (cwd !== undefined) {
      const argIssue = interpreterArgIssue(options.interpreter_args, interpreterProfile, cwd, targetOs);
      if (argIssue) issues.push(argIssue);
    }
  }

  if (options.increment_var !== undefined) {
    if (!ENV_KEY_PATTERN.test(options.increment_var)) {
      issues.push({
        field: "increment_var",
        message: `increment_var must match ${ENV_KEY_PATTERN.source}`,
      });
    } else if (isReservedEnvKey(options.increment_var)) {
      issues.push({
        field: "increment_var",
        message: `increment_var '${options.increment_var}' is reserved by PM2`,
      });
    } else if (!(options.increment_var in (options.env ?? {}))) {
      issues.push({
        field: "increment_var",
        message: `increment_var '${options.increment_var}' must exist in env`,
      });
    }
  }

  for (const convention of ENTRYPOINT_CONVENTIONS) {
    if (!convention.matches(script)) continue;

    if (convention.requiredRuntimeId && interpreterProfile?.id !== convention.requiredRuntimeId) {
      issues.push({
        field: "interpreter",
        message: `script matches a known entrypoint convention — interpreter should be a ${convention.requiredRuntimeId} executable`,
      });
    }

    if (convention.requiresArgs && !options.args) {
      issues.push({
        field: "args",
        message: "this entrypoint requires a subcommand in 'args'",
      });
    }
  }

  return issues;
}

export function inspect(command: InspectCommand, input: StartPayloadType | unknown, context: InspectContext = {}): StartIssue[] {
  switch (command) {
    case "start":
      return inspectStart(input as StartPayloadType, context);
    default:
      return [];
  }
}
