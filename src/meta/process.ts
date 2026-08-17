import { t } from "elysia";

const processIdParams = t.Object({ id: t.Number({ description: "pm_id of the process (see GET /list)" }) });

const flushParams = t.Object({
  id: t.Optional(t.Number({ description: "pm_id of the process; omit to flush ALL processes" })),
});

const routeMeta = {
  list: {
    detail: {
      summary: "List all PM2 processes",
      description:
        "Returns all PM2-managed processes with live CPU, memory, restart counts, and status. Use this first to discover the `pm_id` values required by other routes.",
      tags: ["Processes"],
      operationId: "listProcesses",
    },
  },
  health: {
    detail: {
      summary: "API health check",
      description:
        "Liveness check for this API server itself (not the PM2 processes). Useful for uptime monitoring and load balancer probes.",
      tags: ["System"],
      operationId: "healthCheck",
    },
  },
  describe: {
    params: processIdParams,
    detail: {
      summary: "Get details of one process",
      description:
        "Fetches detailed info for a single process by its `pm_id`. Unlike `/list`, returns 404 if the id does not exist.",
      tags: ["Processes"],
      operationId: "describeProcess",
    },
  },
  start: {
    body: t.Object({
      script: t.String({
        description: "Path to the script to run (required)",
        examples: ["C:\\apps\\my-service\\index.js"],
      }),
      name: t.Optional(t.String({
        description: "Process name shown in pm2 list",
        examples: ["my-service"],
      })),
      namespace: t.Optional(t.String({
        description: "PM2 namespace (defaults to 'default'). Use to isolate same-named processes.",
        examples: ["default"],
      })),
      cwd: t.Optional(t.String({
        description: "Working directory for the script",
        examples: ["C:\\apps\\my-service"],
      })),
      instances: t.Optional(t.Union([t.Number(), t.String()], {
        description: "Number of instances (cluster mode). One row is returned per instance. Requires exec_mode 'cluster'.",
        examples: [1, 2, "max"],
      })),
      exec_mode: t.Optional(t.Union([t.Literal("fork"), t.Literal("cluster")], {
        description: "Execution mode. 'cluster' is required for instances > 1 (Node only). 'fork' (default) for a single process.",
        examples: ["fork"],
      })),
      interpreter: t.Optional(t.String({
        description: "Interpreter to use, e.g. 'node', 'bun', 'python', 'php', or 'none' for an executable/binary/script.",
        examples: ["node", "none", "python", "php"],
      })),
      node_args: t.Optional(t.Union([t.String(), t.Array(t.String())], {
        description: "Arguments passed to the interpreter itself (Node/Bun only), e.g. '--env-file=.env'.",
        examples: ["--env-file=.env"],
      })),
      args: t.Optional(t.Union([t.String(), t.Array(t.String())], {
        description: "Arguments passed to the script itself, e.g. PHP built-in server flags.",
        examples: ["-S 127.0.0.1:8080 server.php", "--port 5000"],
      })),
      env: t.Optional(t.Record(t.String(), t.String(), {
        description: "Environment variables injected into the spawned process.",
        examples: [{ NODE_ENV: "production", PORT: "3000" }],
      })),
      watch: t.Optional(t.Boolean({
        description: "Restart on file changes",
        examples: [false],
      })),
      autorestart: t.Optional(t.Boolean({
        description: "Restart automatically on crash",
        examples: [true],
      })),
      cron_restart: t.Optional(t.String({
        description: "Cron expression to periodically restart the process, e.g. '*/5 * * * *'.",
        examples: ["*/5 * * * *"],
      })),
    }),
    detail: {
      summary: "Register and start a new process",
      description:
        "Registers and launches a new process under PM2. `script` is required; other fields are PM2 start options. PM2 will keep the process alive according to its `autorestart`/`watch` settings.\n\nLanguage recipes:\n- **Node**: `script: index.js`, `interpreter: node`, `node_args: --env-file=.env`\n- **Bun**: `script: index.ts`, `interpreter: bun`\n- **PHP**: `script: server.php`, `interpreter: php`, `args: -S 127.0.0.1:8080`\n- **Python**: `script: app.py`, `interpreter: python`, `args: --port 5000`\n- **Go/binary**: `script: ./my-binary`, `interpreter: none`\n\nThe response `info` is always an array — one `ProcessSummary` per launched instance.",
      tags: ["Processes"],
      operationId: "startProcess",
    },
  },
  stop: {
    params: processIdParams,
    detail: {
      summary: "Stop a process",
      description:
        "Gracefully stops a running process. The process stays **registered** in PM2 (status 'stopped') and can be started again via restart. To remove it entirely, use DELETE /delete/:id.",
      tags: ["Processes"],
      operationId: "stopProcess",
    },
  },
  restart: {
    params: processIdParams,
    detail: {
      summary: "Restart a process",
      description:
        "Kills and re-launches a process. Also works on stopped processes (acts as start). Use after code or environment changes.",
      tags: ["Processes"],
      operationId: "restartProcess",
    },
  },
  reload: {
    params: processIdParams,
    detail: {
      summary: "Zero-downtime reload",
      description:
        "Reloads a process without downtime by restarting instances one at a time. Only meaningful for **cluster mode** processes with multiple instances; falls back to a normal restart in fork mode.",
      tags: ["Processes"],
      operationId: "reloadProcess",
    },
  },
  delete: {
    params: processIdParams,
    detail: {
      summary: "Delete a process permanently",
      description:
        "Stops the process **and removes it from PM2's registry entirely**. The `pm_id` is freed and may be recycled by PM2 for future processes. Unlike stop, this cannot be undone via restart.",
      tags: ["Processes"],
      operationId: "deleteProcess",
    },
  },
  flush: {
    params: flushParams,
    detail: {
      summary: "Flush (empty) log files",
      description:
        "Clears (empties) the log files for one process, or for **all** processes if the id is omitted. Does not affect running state.",
      tags: ["Processes"],
      operationId: "flushLogs",
    },
  },
};

export const getRouteMeta = <K extends keyof typeof routeMeta>(key: K) => routeMeta[key];
