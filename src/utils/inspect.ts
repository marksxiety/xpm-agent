import { win32, posix } from "node:path";
import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";
import { parseDurationMs } from "./duration";
import { ENV_KEY_PATTERN, isReservedEnvKey } from "./env-keys";
import { AGENT_NAME, AGENT_NAMESPACE } from "../pm2/cli";
import type { StartIssue, FlagRule, InspectCommand } from "../types/inspect";

type StartPayloadType = Static<typeof StartPayload>;
export type TargetOs = "win32" | "linux";

export interface InspectContext {
  /** Optional allowlist of absolute app roots the cwd must live under. */
  appRoots?: string[];
  /** The agent's own directory; a payload may not use it as cwd. */
  agentDir?: string;
  /** Optional allowlist of directories the interpreter executable must live under. Unset or empty = any absolute path. */
  interpreterRoots?: string[];
  /**
   * Allowed interpreter flags, keyed by lowercase executable name without extension
   * (e.g. "node", "python"). An interpreter with no entry accepts no interpreter_args.
   */
  interpreterFlags?: Record<string, FlagRule[]>;
}

const NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const NAMESPACE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isAbsoluteForTarget(p: string, targetOs: TargetOs): boolean {
  return targetOs === "win32" ? win32.isAbsolute(p) : posix.isAbsolute(p);
}

function pathApiFor(targetOs: TargetOs) {
  return targetOs === "win32" ? win32 : posix;
}

function hasParentSegment(p: string): boolean {
  return p.split(/[\\/]+/).includes("..");
}

/** Normalizes for comparison: resolves, strips the Windows `\\?\` prefix, case-folds on win32. */
function normalizeForCompare(p: string, targetOs: TargetOs): string {
  const api = pathApiFor(targetOs);
  let normalized = api.resolve(p);
  if (targetOs === "win32") {
    normalized = normalized.replace(/^\\\\\?\\/, "").toLowerCase();
  }
  return normalized;
}

function isInsideDirectory(parent: string, child: string, targetOs: TargetOs): boolean {
  const api = pathApiFor(targetOs);
  const normalizedParent = normalizeForCompare(parent, targetOs);
  const normalizedChild = normalizeForCompare(child, targetOs);
  if (normalizedParent === normalizedChild) return true;
  const rel = api.relative(normalizedParent, normalizedChild);
  return rel !== "" && !rel.startsWith("..") && !api.isAbsolute(rel);
}

function resolveStartScriptPath(cwd: string, script: string, targetOs: TargetOs): string {
  const api = pathApiFor(targetOs);
  return api.isAbsolute(script) ? script : api.resolve(cwd, script);
}

function isResolvedInside(parent: string, candidate: string, targetOs: TargetOs): boolean {
  return isInsideDirectory(parent, resolveStartScriptPath(parent, candidate, targetOs), targetOs);
}

/** "C:\Program Files\nodejs\node.exe" -> "node". Used only as a config lookup key. */
function executableKey(interpreter: string): string {
  return (interpreter.split(/[\\/]/).pop() ?? interpreter).replace(/\.exe$/i, "").toLowerCase();
}

/**
 * Converts flag rules from the agent's JSON config (patterns are strings there)
 * into FlagRule objects. Throws on a bad regex so a broken config fails at
 * startup instead of at request time.
 */
export function parseFlagRules(
  raw: Record<string, Array<{ kind: "exact" | "pattern" | "path"; flag?: string; pattern?: string }>>,
): Record<string, FlagRule[]> {
  const out: Record<string, FlagRule[]> = {};
  for (const [key, rules] of Object.entries(raw)) {
    out[key.toLowerCase()] = rules.map((rule): FlagRule => {
      if (rule.kind === "pattern") return { kind: "pattern", pattern: new RegExp(rule.pattern ?? "") };
      return { kind: rule.kind, flag: rule.flag ?? "" };
    });
  }
  return out;
}

function parseArgTokens(raw: string | string[]): string[] {
  const tokens = Array.isArray(raw) ? raw : raw.split(/\s+/);
  return tokens.flatMap((token) => token.split(/\s+/)).filter((token) => token.length > 0);
}

/**
 * Checks interpreter flags against the configured allowlist for this
 * interpreter. Anything not listed (e.g. `--require`, `-e`, `-c`) can execute
 * code and is rejected.
 */
function interpreterArgIssue(
  raw: string | string[],
  rules: FlagRule[],
  label: string,
  cwd: string,
  targetOs: TargetOs,
): StartIssue | undefined {
  const tokens = parseArgTokens(raw);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    let handled = false;

    for (const rule of rules) {
      if (rule.kind === "exact" && token === rule.flag) {
        handled = true;
        break;
      }

      if (rule.kind === "pattern" && rule.pattern.test(token)) {
        handled = true;
        break;
      }

      if (rule.kind === "path" && (token === rule.flag || token.startsWith(`${rule.flag}=`))) {
        const value = token === rule.flag ? tokens[index + 1] : token.slice(rule.flag.length + 1);
        if (!value || !isResolvedInside(cwd, value, targetOs)) {
          return {
            field: "interpreter_args",
            message: `'${rule.flag}' must point to a file inside cwd`,
          };
        }
        if (token === rule.flag) index += 1; // consume the separate value token
        handled = true;
        break;
      }
    }

    if (!handled) {
      return {
        field: "interpreter_args",
        message: `interpreter flag '${token}' is not allowed for ${label}`,
      };
    }
  }

  return undefined;
}

export function inspectStart(options: StartPayloadType, context: InspectContext = {}): StartIssue[] {
  const issues: StartIssue[] = [];
  const script = options.script ?? "";
  const interpreter = options.interpreter;
  const targetOs: TargetOs = options.targetOs ?? "win32";
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

  // The schema only accepts "fork"/1, but the controller can be called
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

  const DURATION_FIELDS = ["min_uptime", "restart_delay", "kill_timeout", "watch_delay"] as const;
  for (const field of DURATION_FIELDS) {
    const value = options[field];
    if (value !== undefined && parseDurationMs(value) === undefined) {
      issues.push({
        field,
        message: `${field} must be a number of milliseconds or a duration string like '10s', '500ms', '2m'`,
      });
    }
  }

  // Interpreter paths are validated against the OS the target process will
  // run on (targetOs), not the OS hosting this API. The agent does not know
  // which languages exist: "none" or an absolute path, optionally restricted
  // to the server's configured interpreter roots.
  if (interpreter !== "none") {
    if (!isAbsoluteForTarget(interpreter, targetOs)) {
      issues.push({
        field: "interpreter",
        message:
          targetOs === "win32"
            ? "interpreter must be an absolute path to the executable (e.g. 'C:\\Program Files\\nodejs\\node.exe'), not a bare name like 'node' or 'py' — only 'none' is accepted as a bare value"
            : "interpreter must be an absolute path to the executable (e.g. '/usr/bin/node'), not a bare name like 'node' or 'py' — only 'none' is accepted as a bare value",
      });
    } else if (
      context.interpreterRoots !== undefined &&
      context.interpreterRoots.length > 0 &&
      !context.interpreterRoots.some((root) => isInsideDirectory(root, interpreter, targetOs))
    ) {
      issues.push({
        field: "interpreter",
        message: "interpreter must be inside one of the configured interpreter roots",
      });
    }
  }

  if (options.interpreter_args !== undefined) {
    if (interpreter === "none") {
      issues.push({
        field: "interpreter_args",
        message: "'interpreter_args' requires an interpreter",
      });
    } else {
      const key = executableKey(interpreter);
      const rules = context.interpreterFlags?.[key];

      if (rules === undefined || rules.length === 0) {
        issues.push({
          field: "interpreter_args",
          message: `'interpreter_args' isn't allowed for '${key}' — no interpreter flags are configured on this server`,
        });
      } else if (cwd !== undefined) {
        const argIssue = interpreterArgIssue(options.interpreter_args, rules, key, cwd, targetOs);
        if (argIssue) issues.push(argIssue);
      }
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
