import { t } from "elysia";

export const ProcessIdParams = t.Object({ id: t.Number({ description: "pm_id of the process (see GET /list)" }) });

export const FlushParams = t.Object({
  id: t.Optional(t.Number({ description: "pm_id of the process; omit to flush ALL processes" })),
});

export const LogsParams = t.Object({ id: t.Number({ description: "pm_id of the process (see GET /list)" }) });

export const LogsQuery = t.Object({
  tail: t.Optional(t.Integer({
    description: "Number of trailing log lines to return (default 50, max 500)",
    minimum: 1,
    maximum: 500,
    examples: [50],
  })),
  type: t.Optional(t.Union(
    [t.Literal("both"), t.Literal("output"), t.Literal("error")],
    { description: "Which log stream(s) to return (default: both)" },
  )),
});

export const ListQuery = t.Object({
  logs: t.Optional(t.Integer({
    description:
      "Number of trailing log lines to attach to each process summary (last N lines of both the `out` and `error` streams). Omit for a list without logs. Default 50, max 500.",
    minimum: 1,
    maximum: 500,
    examples: [10],
  })),
});

export const DeleteLogsQuery = t.Object({
  delete_logs: t.Optional(t.Boolean({
    description:
      "Also delete the process's log files (<base>-out.log and <base>-error.log) from ~/.pm2/logs/. Defaults to false — PM2 does not remove log files on delete.",
    examples: [true],
  })),
});

/**
 * Flat passthrough schema for POST /pm2/start.
 *
 * The payload mirrors pm2's own `StartOptions` (see node_modules/pm2/types/index.d.ts).
 * This API applies NOTHING: every field is passed to pm2 verbatim. The `default`
 * values below are pm2's own runtime defaults — pm2 applies them when the field
 * is omitted. Descriptions state the provenance for each default.
 *
 * Fields are grouped: identity → invocation → execution → restart behavior →
 * Windows → environment → watching → scheduling.
 */
export const StartPayload = t.Object({
  name: t.String({
    description: "Process name shown in `pm2 list`. Used in log file names and lifecycle commands. Required.",
    examples: ["client", "server", "worker"],
  }),
  targetOs: t.Optional(t.Union([t.Literal("win32"), t.Literal("linux")], {
    description:
      "OS of the target server this process will run on. Determines interpreter path validation rules (Windows drive-letter paths vs POSIX absolute paths). Defaults to 'win32'.",
    examples: ["win32", "linux"],
    default: "win32",
  })),
  namespace: t.Optional(t.String({
    description:
      "PM2 namespace for the process. Defaults to `'default'` (pm2 built-in). Use to isolate same-named processes.",
    examples: ["DPR", "default"],
    default: "default",
  })),
  cwd: t.Optional(t.String({
    description:
      "Working directory the process is launched from. PM2 has no default — `script` is resolved against the API server's cwd when omitted. Almost always set this.",
    examples: ["C:\\apps\\my-service"],
  })),
  script: t.String({
    description:
      "Path to the script to run. Can be a relative or absolute path; when `cwd` is omitted, it is resolved against the API server's working directory. Examples: a Node entry file (`.output/server/index.mjs`), an artisan binary (`artisan`), a PHP file, or a compiled binary.",
    examples: ["C:\\apps\\my-service\\index.js", ".output/server/index.mjs", "artisan"],
  }),
  args: t.Optional(t.Union([t.String(), t.Array(t.String())], {
    description:
      "Arguments passed to the script itself. Examples: `-S 127.0.0.1:8080 server.php` (PHP built-in server), `--port 3000`, or `schedule:work` (artisan subcommand). No pm2 default.",
    examples: ["-S 127.0.0.1:8080 server.php", "--port 3000", ["--port", "3000"]],
  })),
  interpreter: t.String({
    description:
      "Absolute path to the interpreter executable used to launch `script`. Required. Use `'none'` when `script` is itself an executable/binary. Bare names like `'node'`/`'php'` are rejected — only `'none'` is accepted as a bare value.",
    examples: ["C:\\Program Files\\nodejs\\node.exe", "C:\\php\\php.exe", "C:\\Python312\\python.exe", "none"],
  }),
  interpreter_args: t.Optional(t.Union([t.String(), t.Array(t.String())], {
    description:
      "Arguments passed to the interpreter process (e.g. Node/V8 flags like `--max-old-space-size=512` or `--env-file=.env`). Only applies when `interpreter` is node-family (`node`, `bun`, etc.). No pm2 default.",
    examples: ["--env-file=.env", ["--env-file=.env", "--max-old-space-size=512"]],
  })),
  exec_mode: t.Optional(t.Union([t.Literal("fork"), t.Literal("cluster")], {
    description:
      "Execution mode. Defaults to `'fork'` (pm2 built-in). `'cluster'` is required for `instances > 1` and is Node-only.",
    examples: ["fork", "cluster"],
    default: "fork",
  })),
  instances: t.Optional(t.Union([t.Number(), t.Literal("max")], {
    description:
      "Number of process instances. Defaults to `1` (pm2 built-in). Only meaningful with `exec_mode: 'cluster'`; `'max'` uses one instance per CPU core.",
    examples: [1, 2, "max"],
    default: 1,
  })),
  autorestart: t.Optional(t.Boolean({
    description:
      "Restart the process automatically when it crashes. Defaults to `true` (pm2 built-in). Set `false` for one-shot jobs (e.g. `schedule:work`).",
    examples: [true, false],
    default: true,
  })),
  max_restarts: t.Optional(t.Number({
    description:
      "Consecutive unstable-restart limit — an unstable restart is a crash within `min_uptime` (default 1s) of launch. At the limit PM2 marks the process `errored` and stops restarting it; `0` means never restart (use `autorestart: false` for the cleaner 'no restart' behavior). Defaults to `16` (pm2 built-in).",
    examples: [10, 16],
    default: 16,
  })),
  windowsHide: t.Optional(t.Boolean({
    description:
      "Hide the process console window on Windows. Defaults to `false` (pm2 built-in). Recommended `true` on Windows hosts to avoid a console window per spawned process.",
    examples: [true, false],
    default: false,
  })),
  env: t.Optional(t.Record(t.String(), t.String(), {
    description:
      "Environment variables injected into the spawned process. pm2 passes only this object (plus its own additions); it does NOT inherit the shell env. Defaults to `{}`.",
    examples: [{ NODE_ENV: "production", PORT: "3000" }],
    default: {},
  })),
  watch: t.Optional(t.Union([t.Boolean(), t.Array(t.String())], {
    description:
      "Restart on file changes. `true` watches the whole tree; a string array watches only those paths. Defaults to `false` (pm2 built-in).",
    examples: [false, true, ["src", "app"]],
    default: false,
  })),
  ignore_watch: t.Optional(t.Array(t.String(), {
    description:
      "Paths/glob patterns excluded from `watch`. No pm2 default. Recommended: `['node_modules', 'logs', '*.log']` when `watch` is enabled — otherwise pm2 restarts on its own log writes.",
    examples: [["node_modules", "logs", "*.log"]],
  })),
  watch_delay: t.Optional(t.Number({
    description:
      "Delay in milliseconds before restarting a watched process after a file change. PM2 has no default — restarts fire immediately on change.",
    examples: [1000, 5000],
  })),
  cron_restart: t.Optional(t.String({
    description:
      "Cron expression to periodically restart the process, e.g. `'*/5 * * * *'`. No pm2 default.",
    examples: ["*/5 * * * *"],
  })),
}, {
  examples: [{
    name: "example-app",
    namespace: "example",
    targetOs: "win32",
    cwd: "C:\\Example\\Application",
    script: ".output/server/index.mjs",
    args: ["--port", "3000"],
    interpreter: "C:\\Program Files\\nodejs\\node.exe",
    interpreter_args: ["--env-file=.env"],
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    windowsHide: true,
    watch: false,
  }],
});
