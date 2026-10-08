import type { StartOptions } from "pm2";
import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";
import type { StartIssue } from "../types/inspect";
import { inspectStart } from "./inspect";
import { parseDurationMs } from "./duration";

type StartPayloadType = Static<typeof StartPayload>;

export type SanitizeInput = StartPayloadType;

/**
 * Payload `env` keys that PM2 folds into `pm2_env` before allocating an id
 * (God.js executeApp). Letting a caller set them would overwrite PM2's own
 * process metadata — including another process's pm_id slot.
 */
const RESERVED_ENV_KEYS = new Set([
  "namespace",
  "name",
  "status",
  "exec_mode",
  "env",
  "args",
  "command",
  "created_at",
  "restart_time",
  "restart_delay",
  "unstable_restarts",
  "instance_var",
  "instances",
  "autorestart",
  "autostart",
  "stop_exit_codes",
  "treekill",
  "exit_code",
  "watch",
  "filter_env",
  "versioning",
  "vizion",
  "automation",
  "pmx",
  "pmx_module",
  "kill_retry_time",
  "merge_logs",
  "windowsHide",
  "prev_restart_delay",
  "node_args",
  "exec_interpreter",
  "MODULE_DEBUG",
  "NODE_APP_INSTANCE",
  "unique_id",
  "username",
  "max_restarts",
  "min_uptime",
  "kill_timeout",
  "wait_ready",
  "listen_timeout",
  "shutdown_with_message",
  "exp_backoff_restart_delay",
  "cron_restart",
  "max_memory_restart",
  "increment_var",
  "ignore_watch",
  "watch_delay",
  "log_date_format",
  "vizion_running",
  "node_version",
]);

const RESERVED_ENV_PREFIXES = ["pm_", "PM2_", "axm_"];

const RESERVED_ENV_KEYS_LOWER = new Set([...RESERVED_ENV_KEYS].map((key) => key.toLowerCase()));
const RESERVED_ENV_PREFIXES_LOWER = RESERVED_ENV_PREFIXES.map((prefix) => prefix.toLowerCase());

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

export function isReservedEnvKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    RESERVED_ENV_KEYS_LOWER.has(normalized) ||
    RESERVED_ENV_PREFIXES_LOWER.some((prefix) => normalized.startsWith(prefix))
  );
}

export function sanitizeEnv(input: Record<string, string> | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!isReservedEnvKey(key)) env[key] = value;
  }
  return env;
}

export function sanitizeProcessConfig(
  payload: StartPayloadType,
): { options: StartOptions | null; issues: StartIssue[] } {
  const issues = inspectStart(payload);
  if (issues.length > 0) return { options: null, issues };

  // Empty/whitespace must never reach PM2: the env mirror below would write it
  // into pm2_env.namespace after PM2's own falsy fallback ran.
  const namespace = payload.namespace?.trim() || "default";

  // Nothing is inherited (see denyInheritedEnv); the payload env is the child's
  // entire environment. The namespace mirror keeps pm2_env.namespace pinned to
  // the sanitized value.
  const env = sanitizeEnv(payload.env);
  env.namespace = namespace;

  const minUptime = payload.min_uptime === undefined ? undefined : parseDurationMs(payload.min_uptime);

  // PM2 evaluates `unstable_restarts >= max_restarts` on every exit, so 0 marks
  // the app errored immediately (even on a manual stop). autorestart:false is
  // the correct "run once" primitive.
  const disablesRestarts = payload.max_restarts === 0;

  const options = { ...payload } as StartOptions & { targetOs?: unknown };
  delete options.targetOs;
  options.namespace = namespace;
  options.env = env;
  options.filter_env = denyInheritedEnv();
  options.time = true;
  if (minUptime !== undefined) options.min_uptime = minUptime;
  if (disablesRestarts) {
    delete options.max_restarts;
    options.autorestart = false;
  }

  return { options, issues: [] };
}
