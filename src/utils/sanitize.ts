import type { StartOptions } from "pm2";
import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";
import type { StartIssue } from "../types/inspect";
import { inspectStart, type InspectContext } from "./inspect";
import { parseDurationMs } from "./duration";
import { ENV_KEY_PATTERN, isReservedEnvKey } from "./env-keys";

export { isReservedEnvKey } from "./env-keys";

type StartPayloadType = Static<typeof StartPayload>;

export type SanitizeInput = StartPayloadType;

/**
 * Every variable the agent currently holds. PM2 merges the caller's
 * `process.env` into each app started programmatically
 * (pm2 Common.js prepareAppConf), and `filter_env` is the only API lever that
 * removes keys before the child is spawned. Listing every key means nothing is
 * inherited — the child gets exactly the payload env plus PM2's own runtime
 * metadata, which PM2 injects separately.
 *
 * `filter_env: true` is not usable here: PM2's guard is
 * `app.filter_env.length > 0`, which is false for a boolean, so `true` falls
 * back to `safeExtend(process.env)` and leaks agent secrets.
 */
function denyInheritedEnv(): string[] {
  return Object.keys(process.env);
}

export function validateEnv(input: Record<string, string> | undefined): {
  env: Record<string, string>;
  issues: StartIssue[];
} {
  const env: Record<string, string> = {};
  const issues: StartIssue[] = [];

  for (const [key, value] of Object.entries(input ?? {})) {
    const trimmed = key.trim();
    if (trimmed !== key || !ENV_KEY_PATTERN.test(trimmed)) {
      issues.push({
        field: "env",
        message: `env key '${key}' must match ${ENV_KEY_PATTERN.source}`,
      });
      continue;
    }
    if (isReservedEnvKey(trimmed)) {
      issues.push({
        field: "env",
        message: `env key '${key}' is reserved by PM2 and cannot be set`,
      });
      continue;
    }
    env[trimmed] = value;
  }

  return { env, issues };
}

export function sanitizeProcessConfig(
  payload: StartPayloadType,
  context: InspectContext = {},
): { options: StartOptions | null; issues: StartIssue[] } {
  const issues = inspectStart(payload, context);
  const { env, issues: envIssues } = validateEnv(payload.env);
  issues.push(...envIssues);
  if (issues.length > 0) return { options: null, issues };

  // Empty/whitespace must never reach PM2: the env mirror below would write it
  // into pm2_env.namespace after PM2's own falsy fallback ran.
  const namespace = payload.namespace?.trim() || "default";

  // Nothing is inherited (see denyInheritedEnv); the payload env is the child's
  // entire environment. The namespace mirror keeps pm2_env.namespace pinned to
  // the sanitized value.
  const sanitizedEnv = { ...env, namespace };

  // Durations are validated by inspectStart above; normalize every one to
  // milliseconds because PM2 does numeric math on them.
  const minUptime = payload.min_uptime === undefined ? undefined : parseDurationMs(payload.min_uptime);
  const restartDelay =
    payload.restart_delay === undefined ? undefined : parseDurationMs(payload.restart_delay);
  const killTimeout =
    payload.kill_timeout === undefined ? undefined : parseDurationMs(payload.kill_timeout);
  const watchDelay =
    payload.watch_delay === undefined ? undefined : parseDurationMs(payload.watch_delay);

  // PM2 evaluates `unstable_restarts >= max_restarts` on every exit, so 0 marks
  // the app errored immediately (even on a manual stop). autorestart:false is
  // the correct "run once" primitive.
  const disablesRestarts = payload.max_restarts === 0;

  // Explicit pick list: only schema fields reach PM2. Cluster mode and multiple
  // instances are not passable at all (see inspectStart).
  const options: StartOptions = {
    name: payload.name,
    cwd: payload.cwd,
    script: payload.script,
    interpreter: payload.interpreter,
    exec_mode: "fork",
    instances: 1,
    namespace,
    env: sanitizedEnv,
    filter_env: denyInheritedEnv(),
    time: true,
    // Defaults to hiding the console window on Windows unless explicitly disabled.
    windowsHide: payload.windowsHide ?? true,
  };

  if (payload.args !== undefined) options.args = payload.args;
  if (payload.interpreter_args !== undefined) options.interpreter_args = payload.interpreter_args;
  if (payload.autorestart !== undefined) options.autorestart = payload.autorestart;
  if (payload.max_memory_restart !== undefined) options.max_memory_restart = payload.max_memory_restart;
  if (payload.increment_var !== undefined) options.increment_var = payload.increment_var;
  if (payload.watch !== undefined) options.watch = payload.watch;
  if (payload.ignore_watch !== undefined) options.ignore_watch = payload.ignore_watch;
  if (payload.cron_restart !== undefined) options.cron_restart = payload.cron_restart;
  if (restartDelay !== undefined) options.restart_delay = restartDelay;
  if (killTimeout !== undefined) options.kill_timeout = killTimeout;
  if (watchDelay !== undefined) options.watch_delay = watchDelay;
  if (minUptime !== undefined) options.min_uptime = minUptime;

  if (disablesRestarts) {
    options.autorestart = false;
  } else if (payload.max_restarts !== undefined) {
    options.max_restarts = payload.max_restarts;
  }

  return { options, issues: [] };
}
