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
]);

const RESERVED_ENV_PREFIXES = ["pm_", "PM2_", "axm_"];

/**
 * Denylist handed to PM2's `filter_env`. PM2 merges the agent's own
 * `process.env` into every app started from this process (Common.js
 * prepareAppConf), and `filter_env` is the only API lever that removes those
 * keys before the child is spawned.
 *
 * Supplying `filter_env` makes PM2 call filterEnv(process.env) instead of
 * `safeExtend`, so this list must also cover `safeExtend`'s ignore list
 * (pm2@7.0.3 Common.js:593) plus the keys it misses — otherwise internals like
 * `pm_id`/`name`/`exec_mode` would start leaking. Includes the agent's own
 * `.env` secrets so customer apps cannot read them. Re-verify with
 * `bun run leak-check` on every pm2 upgrade.
 */
export const INHERITED_ENV_DENYLIST: string[] = [
  "pm_",
  "PM2_",
  "axm_",
  "name",
  "namespace",
  "status",
  "exec_mode",
  "env",
  "args",
  "command",
  "created_at",
  "restart_time",
  "restart_delay",
  "unstable_restart",
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
  "AUTH_TOKEN",
  "SERVER_PORT",
  "CORS_ORIGIN",
];

export function isReservedEnvKey(key: string): boolean {
  return RESERVED_ENV_KEYS.has(key) || RESERVED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
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

  // PM2 merges the inherited agent env first and the payload env last, so the
  // mirror keeps pm2_env.namespace pinned to the sanitized value.
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
  options.filter_env = INHERITED_ENV_DENYLIST;
  options.time = true;
  if (minUptime !== undefined) options.min_uptime = minUptime;
  if (disablesRestarts) {
    delete options.max_restarts;
    options.autorestart = false;
  }

  return { options, issues: [] };
}
