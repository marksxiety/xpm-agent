/**
 * Environment keys the agent never lets a payload set.
 *
 * Two groups:
 * - PM2 runtime/metadata keys: `God.executeApp` copies `pm2_env.env` onto
 *   `pm2_env` itself, so a payload key matching PM2 metadata would overwrite it
 *   (node_modules/pm2/lib/God.js executeApp).
 * - Loader options that execute code or inject files into the runtime:
 *   `NODE_OPTIONS`/`BUN_OPTIONS` (e.g. `--require`), `NODE_PATH`,
 *   `PYTHONSTARTUP`/`PYTHONPATH`, `PHPRC`/`PHP_INI_SCAN_DIR`, `LD_PRELOAD`.
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
  "NODE_OPTIONS",
  "BUN_OPTIONS",
  "NODE_PATH",
  "PYTHONSTARTUP",
  "PYTHONPATH",
  "PHPRC",
  "PHP_INI_SCAN_DIR",
  "LD_PRELOAD",
]);

const RESERVED_ENV_PREFIXES = ["pm_", "PM2_", "axm_"];

const RESERVED_ENV_KEYS_LOWER = new Set([...RESERVED_ENV_KEYS].map((key) => key.toLowerCase()));
const RESERVED_ENV_PREFIXES_LOWER = RESERVED_ENV_PREFIXES.map((prefix) => prefix.toLowerCase());

/** Environment variable names a payload may set. */
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isReservedEnvKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    RESERVED_ENV_KEYS_LOWER.has(normalized) ||
    RESERVED_ENV_PREFIXES_LOWER.some((prefix) => normalized.startsWith(prefix))
  );
}
