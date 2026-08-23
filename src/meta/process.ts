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
    detail: {
      summary: "Register and start a new process",
      description:
        "Registers and launches a new process under PM2. `name`, `script`, and `interpreter` are required; every other field is an optional PM2 option and is passed through verbatim — this API applies no defaults. `interpreter` must be an absolute path to the interpreter executable; path validation is OS-aware via `targetOs` — Windows drive-letter paths (e.g. `C:\\Program Files\\nodejs\\node.exe`) for `'win32'` (default), POSIX absolute paths (e.g. `/usr/bin/node`) for `'linux'`. Bare names like `'node'`/`'php'` are rejected, with `'none'` as the only accepted bare value (the script is itself an executable/binary). When an optional field is omitted, PM2 applies its own built-in default: `exec_mode` → 'fork', `instances` → 1, `autorestart` → true, `max_restarts` → 16, `watch` → false, `windowsHide` → false, `namespace` → 'default', `env` → {}.\n\nThe body is validated twice:\n1. **Schema validation (422)** — wrong types / missing required fields, handled by the API's validation layer.\n2. **Configuration guide (422)** — cross-field checks that catch impossible or misleading combos before PM2 sees them. Returns the list of issues in `info` (see error example). Rules: `name` and `script` must be non-empty; `interpreter` must be an absolute executable path for the declared `targetOs` (`'none'` is the only bare value allowed); `instances` must be a positive integer or `'max'`; Node-extension scripts must not use a php/python interpreter; `artisan`/`.php` scripts require a PHP executable path; `artisan` needs a subcommand in `args`; `interpreter_args` only applies to node-family interpreters; `exec_mode: 'cluster'` is Node-only; `instances > 1` requires `exec_mode: 'cluster'`.\n\nThe response `info` is always an array — one `ProcessSummary` per launched instance.",
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
    body: t.Object({
      delete_logs: t.Optional(t.Boolean({
        description:
          "Also delete the process's log files (<base>-out.log and <base>-error.log) from ~/.pm2/logs/. Defaults to false — PM2 does not remove log files on delete.",
        examples: [true],
      })),
    }),
    detail: {
      summary: "Delete a process permanently",
      description:
        "Stops the process **and removes it from PM2's registry entirely**. The `pm_id` is freed and may be recycled by PM2 for future processes. Unlike stop, this cannot be undone via restart.\n\nBy default the process's log files are left on disk (PM2 never removes them). Pass `delete_logs: true` to also delete the `-out.log`/`-error.log` files from `~/.pm2/logs/`.",
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
