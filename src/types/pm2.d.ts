import "pm2";

declare module "pm2" {
  interface StartOptions {
    /**
     * Hide the process console window on Windows.
     * PM2's own default is `false`; set to `true` when the host is Windows
     * to avoid a spawned console window appearing per process.
     */
    windowsHide?: boolean;
    /**
     * Delay (in ms) before restarting a watched process after a file change.
     * PM2 has no default — without it, restarts fire immediately on change.
     */
    watch_delay?: number;
    /**
     * Log file base name. Two files are written to the PM2 logs directory
     * (`~/.pm2/logs/`): `<base>-out.log` (stdout) and `<base>-error.log`
     * (stderr). Defaults to `<namespace>-<name>` when omitted.
     */
    log_file?: string;
    /**
     * Cron expression to periodically restart the process, e.g. "0 2 * * *"
     * (daily at 02:00). The standard 5-field cron format.
     */
    cron_restart?: string;
  }

  /**
   * Flush ALL process logs (pm2's own `pm2 flush` with no id does this).
   */
  export function flush(errback: ErrResultCallback): void;
}
