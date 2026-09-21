import { DeleteLogsQuery, FlushParams, ListQuery, LogsParams, LogsQuery, ProcessIdParams, StartPayload } from "../schemas/process";
import { DescribeResponse, ProcessListResponse, ProcessOverviewResponse } from "./schemas";

const routeMeta = {
  list: {
    query: ListQuery,
    detail: {
      summary: "List all PM2 processes",
      description:
        "Returns all PM2-managed processes with live CPU, memory, restart counts, and status. Use this first to discover the `pm_id` values required by other routes.\n\nPass `?logs=N` (1–500) to also attach the trailing N lines of each process's `out` and `error` log files as a `logs` field on every item. Omit it for a lightweight list without logs — there is no default line count.\n\nPass `?overview=true` to return an object with two keys: `overview` (host-level metrics: CPU utilization percentage and memory usage) and `processes` (the same process summaries). The `logs` param, if provided, still applies to each process summary.",
      tags: ["Processes"],
      operationId: "listProcesses",
      responses: {
        200: {
          description: "`ProcessSummary[]` by default; an object with `overview` and `processes` keys when `?overview=true`.",
          content: {
            "application/json": {
              schema: { oneOf: [ProcessListResponse, ProcessOverviewResponse] },
              examples: {
                list: {
                  summary: "Plain process list (GET /pm2/list)",
                  value: {
                    success: true,
                    message: "PM2 process list retrieved successfully",
                    info: [{
                      pid: 30628,
                      pm_id: 0,
                      name: "example-app",
                      namespace: "example",
                      status: "online",
                      uptime: 1786687862669,
                      restarts: 3,
                      unstable_restarts: 0,
                      exec_mode: "fork_mode",
                      instances: 1,
                      interpreter: "C:\\Program Files\\nodejs\\node.exe",
                      cpu: 1.5,
                      memory: 9420800,
                      cwd: "C:\\Example\\Application",
                      ip_address: "192.168.1.10",
                      watch: false,
                      autorestart: true,
                    }],
                  },
                },
                overview: {
                  summary: "With overview=true (GET /pm2/list?overview=true)",
                  value: {
                    success: true,
                    message: "PM2 process list retrieved successfully",
                    info: {
                      overview: {
                        cpu: {
                          usagePercent: 12.5,
                        },
                        memory: {
                          totalBytes: 17179869184,
                          freeBytes: 6012954214,
                          usedBytes: 11166914970,
                          percentUsed: 65,
                        },
                      },
                      processes: [{
                        pid: 30628,
                        pm_id: 0,
                        name: "example-app",
                        namespace: "example",
                        status: "online",
                        uptime: 1786687862669,
                        restarts: 3,
                        unstable_restarts: 0,
                        exec_mode: "fork_mode",
                        instances: 1,
                        interpreter: "C:\\Program Files\\nodejs\\node.exe",
                        cpu: 1.5,
                        memory: 9420800,
                        cwd: "C:\\Example\\Application",
                        ip_address: "192.168.1.10",
                        watch: false,
                        autorestart: true,
                      }],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  describe: {
    params: ProcessIdParams,
    detail: {
      summary: "Get details of one process",
      description:
        "Fetches detailed info for a single process by its `pm_id`. Returns a single object (not an array) with three keys: `summary` (the same shape used across all routes), `describe` (snake_case process-table fields mirroring `pm2 describe`; non-conditional keys are `null` when PM2 reports no value, and `entire_log_path`/`cron_restart`/`max_memory_restart` are included only when configured), and `metrics` (raw `pm2_env.axm_monitor` code metrics; `{}` for non-Node/Bun interpreters). Returns 404 if the id does not exist.",
      tags: ["Processes"],
      operationId: "describeProcess",
      responses: {
        200: {
          description: "A single object with `summary`, `describe`, and `metrics` keys.",
          content: {
            "application/json": {
              schema: DescribeResponse,
              examples: {
                describe: {
                  summary: "GET /pm2/describe/0",
                  value: {
                    success: true,
                    message: "PM2 process described successfully",
                    info: {
                      summary: {
                        pid: 30628,
                        pm_id: 0,
                        name: "xpm-agent",
                        namespace: "XPM",
                        status: "online",
                        uptime: 660000,
                        restarts: 0,
                        unstable_restarts: 0,
                        exec_mode: "fork_mode",
                        instances: 1,
                        interpreter: "bun",
                        cpu: 0.3,
                        memory: 51380224,
                        cwd: "C:\\Users\\markc\\Desktop\\DEVELOPMENT\\xpm-agent",
                        ip_address: "192.168.1.10",
                        watch: false,
                        autorestart: true,
                      },
                      describe: {
                        version: "1.1.2",
                        script_path: "C:\\Users\\markc\\Desktop\\DEVELOPMENT\\xpm-agent\\dist\\index.js",
                        script_args: null,
                        error_log_path: "C:\\Users\\markc\\.pm2\\logs\\xpm-agent-error-0.log",
                        out_log_path: "C:\\Users\\markc\\.pm2\\logs\\xpm-agent-out-0.log",
                        pid_path: "C:\\Users\\markc\\.pm2\\pids\\xpm-agent-0.pid",
                        interpreter_args: null,
                        node_version: "26.3.0",
                        node_env: "production",
                        created_at: "2026-09-19T02:29:06.651Z",
                      },
                      metrics: {
                        "Heap Size": { value: "3.92", unit: "MiB" },
                        "Heap Usage": { value: "100", unit: "%" },
                        "Used Heap Size": { value: "3.92", unit: "MiB" },
                        "Active requests": { value: "0", unit: "" },
                        "Active handles": { value: "0", unit: "" },
                        "Event Loop Latency": { value: "1.07", unit: "ms" },
                        "Event Loop Latency p95": { value: "1.98", unit: "ms" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  start: {
    body: StartPayload,
    detail: {
      summary: "Register and start a new process",
      description:
        "Registers and launches a new process under PM2. `name`, `script`, and `interpreter` are required; every other field is an optional PM2 option and is passed through verbatim — this API applies no defaults. `interpreter` must be an absolute path to the interpreter executable; path validation is OS-aware via `targetOs` — Windows drive-letter paths (e.g. `C:\\Program Files\\nodejs\\node.exe`) for `'win32'` (default), POSIX absolute paths (e.g. `/usr/bin/node`) for `'linux'`. Bare names like `'node'`/`'php'` are rejected, with `'none'` as the only accepted bare value (the script is itself an executable/binary). When an optional field is omitted, PM2 applies its own built-in default: `exec_mode` → 'fork', `instances` → 1, `autorestart` → true, `max_restarts` → 16, `watch` → false, `windowsHide` → false, `namespace` → 'default', `env` → {}.\n\nThe body is validated twice:\n1. **Schema validation (422)** — wrong types / missing required fields, handled by the API's validation layer.\n2. **Configuration guide (422)** — cross-field checks that catch impossible or misleading combos before PM2 sees them. Returns the list of issues in `info` (see error example). Rules: `name` and `script` must be non-empty; `interpreter` must be an absolute executable path for the declared `targetOs` (`'none'` is the only bare value allowed); `instances` must be a positive integer or `'max'`; Node-extension scripts must use a Node-family interpreter; `.php`/`.py`/`.go` scripts must match their interpreter family; `artisan` requires a PHP executable path and a subcommand in `args`; `manage.py` requires a Python executable path and a subcommand in `args`; `interpreter_args` is only supported by interpreters that accept extra args (Node/Bun and Python); `exec_mode: 'cluster'` is Node-family only; `instances > 1` requires `exec_mode: 'cluster'`.\n\nLogs are always written with PM2's `time: true` — every log line is prefixed with a `[YYYY-MM-DD HH:mm:ss]` timestamp; any `time` value in the payload is ignored.\n\nThe response `info` is always an array — one `ProcessSummary` per launched instance.",
      tags: ["Processes"],
      operationId: "startProcess",
    },
  },
  stop: {
    params: ProcessIdParams,
    detail: {
      summary: "Stop a process",
      description:
        "Gracefully stops a running process. The process stays **registered** in PM2 (status 'stopped') and can be started again via restart. To remove it entirely, use DELETE /delete/:id.",
      tags: ["Processes"],
      operationId: "stopProcess",
    },
  },
  restart: {
    params: ProcessIdParams,
    detail: {
      summary: "Restart a process",
      description:
        "Kills and re-launches a process. Also works on stopped processes (acts as start). Use after code or environment changes.",
      tags: ["Processes"],
      operationId: "restartProcess",
    },
  },
  reload: {
    params: ProcessIdParams,
    detail: {
      summary: "Zero-downtime reload",
      description:
        "Reloads a process without downtime by restarting instances one at a time. Only meaningful for **cluster mode** processes with multiple instances; falls back to a normal restart in fork mode.",
      tags: ["Processes"],
      operationId: "reloadProcess",
    },
  },
  delete: {
    params: ProcessIdParams,
    query: DeleteLogsQuery,
    detail: {
      summary: "Delete a process permanently",
      description:
        "Stops the process **and removes it from PM2's registry entirely**. The `pm_id` is freed and may be recycled by PM2 for future processes. Unlike stop, this cannot be undone via restart.\n\nBy default the process's log files are left on disk (PM2 never removes them). Pass `?delete_logs=true` to also delete the `-out.log`/`-error.log` files from `~/.pm2/logs/`.",
      tags: ["Processes"],
      operationId: "deleteProcess",
    },
  },
  flush: {
    params: FlushParams,
    detail: {
      summary: "Flush (empty) log files",
      description:
        "Clears (empties) the log files for one process. Does not affect running state.",
      tags: ["Processes"],
      operationId: "flushLogs",
    },
  },
  logs: {
    params: LogsParams,
    query: LogsQuery,
    detail: {
      summary: "Get process logs",
      description:
        "Returns the trailing lines of a process's stdout (`out`) and stderr (`error`) log files. `id` is the process's `pm_id`. `tail` caps the number of lines per stream (default 50, max 500). `type` selects the stream: `both` (default), `output`, or `error`. A log file that does not exist (or a stream the process does not write) returns an empty array.",
      tags: ["Processes"],
      operationId: "getProcessLogs",
    },
  },
};

export const getRouteMeta = <K extends keyof typeof routeMeta>(key: K) => routeMeta[key];
