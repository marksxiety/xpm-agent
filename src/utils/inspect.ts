import { win32, posix } from "node:path";
import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";
import { parseDurationMs } from "./duration";
import type { StartIssue, RuntimeProfile, EntrypointConvention, InspectCommand } from "../types/inspect"

function isAbsoluteForTarget(p: string, targetOs: "win32" | "linux"): boolean {
  return targetOs === "win32" ? win32.isAbsolute(p) : posix.isAbsolute(p);
}

type StartPayloadType = Static<typeof StartPayload>;

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

export function inspectStart(options: StartPayloadType): StartIssue[] {
  const issues: StartIssue[] = [];
  const script = options.script ?? "";
  const interpreter = options.interpreter;
  const targetOs = options.targetOs ?? "win32";

  if (options.name?.trim() === "") {
    issues.push({
      field: "name",
      message: "name is required and cannot be empty",
    });
  }

  if (script.trim() === "") {
    issues.push({
      field: "script",
      message: "script is required and cannot be empty",
    });
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

  // PM2 resolves a relative cwd against the agent's own working directory
  // (pm2/lib/Common.js prepareAppConf), never the target app's — reject it.
  if (options.cwd !== undefined && !isAbsoluteForTarget(options.cwd, targetOs)) {
    issues.push({
      field: "cwd",
      message:
        targetOs === "win32"
          ? "cwd must be an absolute Windows path (e.g. 'C:\\apps\\my-service'), not a relative path — PM2 would resolve it against the agent's directory"
          : "cwd must be an absolute POSIX path (e.g. '/srv/apps/my-service'), not a relative path — PM2 would resolve it against the agent's directory",
    });
  }

  const interpreterProfile = findInterpreterProfile(interpreter);
  const scriptProfile = RUNTIME_PROFILES.find((profile) => profile.scriptExtensions.test(script));

  if (scriptProfile && interpreterProfile && scriptProfile.family !== interpreterProfile.family) {
    issues.push({
      field: "interpreter",
      message: `script '${script}' looks like a ${scriptProfile.id} file — interpreter should be a ${scriptProfile.id} executable path`,
    });
  }

  if (options.interpreter_args !== undefined && !interpreterProfile?.supportsInterpreterArgs) {
    issues.push({
      field: "interpreter_args",
      message: `'interpreter_args' isn't supported by this interpreter${interpreterProfile ? ` (${interpreterProfile.id})` : ""
        }`,
    });
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

export function inspect(command: InspectCommand, input: StartPayloadType | unknown): StartIssue[] {
  switch (command) {
    case "start":
      return inspectStart(input as StartPayloadType);
    default:
      return [];
  }
}