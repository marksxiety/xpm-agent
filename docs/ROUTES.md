# PM2 API Reference

Base URL: `http://localhost:4000/pm2` (override port via `SERVER_PORT` env)

Interactive docs: [Swagger UI](http://localhost:4000/swagger)

> **Authentication:** when the `AUTH_TOKEN` env var is set, every request must include `Authorization: Bearer <AUTH_TOKEN>`. Missing or invalid tokens are rejected with `401` (`UNAUTHORIZED`). When `AUTH_TOKEN` is empty/omitted, auth is disabled.

---

## Response Envelope

Every response — success or error — uses the same shape:

```json
{
  "success": true,
  "message": "PM2 process list retrieved successfully",
  "info": []
}
```

| Field | Type | Description |
|---|---|---|
| `success` | boolean | `true` on success, `false` on any error |
| `message` | string | Human-readable result or error description |
| `code` | string | Machine-readable error code — **present only on errors** (e.g. `PROCESS_NOT_FOUND`, `VALIDATION_FAILED`, `INVALID_PROCESS_CONFIGURATION`). Full mapping in [Error Statuses](#error-statuses). |
| `info` | any | The actual payload on success; `null` on error |

> The HTTP status carries the status code (e.g. `404`); the body does not include a separate `status` field.

> **Exceptions:**
> - The `/start` configuration-guide `422` returns the list of violations in `info` (an array of `{ field, message }`), not `null` — see [POST /start](#post-start).
> - Unknown routes (e.g. `GET /pm2/nope`) fall through to Elysia's default 404 and return a plain-text `NOT_FOUND` body instead of the envelope.

---

## Routes

### GET /list

Returns all PM2-managed processes with live CPU, memory, restart counts, and status. Use this first to discover the `pm_id` values required by other routes.

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `logs` | integer | no | When present, attaches `logs: { out, error }` to each process summary with the trailing N lines of each stream (1–500). Omit the param entirely for a lightweight list without logs — there is no default line count here (the 50-line default applies only to `GET /logs/:id`). |
| `overview` | boolean | no | When `true`, returns an object with two keys: `overview` (host-level metrics: CPU utilization percentage and memory usage) and `processes` (the process summaries). The `logs` param, if provided, still applies to each process summary. |

**Request:** `GET /pm2/list`, `GET /pm2/list?logs=5`, or `GET /pm2/list?logs=5&overview=true`

**Response `200`** (plain list — `info` is an array):

```json
{
  "success": true,
  "message": "PM2 process list retrieved successfully",
  "info": [
    {
      "pid": 30628,
      "pm_id": 0,
      "name": "example-app",
      "namespace": "example",
      "status": "online",
      "uptime": 119676,
      "restarts": 3,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "C:\\Program Files\\nodejs\\node.exe",
      "cpu": 1.5,
      "memory": 9420800,
      "cwd": "C:\\Example\\Application",
      "ip_address": "192.168.1.10",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

**Response `200`** (`?overview=true` — `info` is an object with `overview` and `processes` keys; each process summary may carry a `logs` key when `?logs=N` is also passed):

```json
{
  "success": true,
  "message": "PM2 process list retrieved successfully",
  "info": {
    "overview": {
      "cpu": {
        "usagePercent": 12.5
      },
      "memory": {
        "totalBytes": 17179869184,
        "freeBytes": 6012954214,
        "usedBytes": 11166914970,
        "percentUsed": 65
      }
    },
    "processes": [
      {
        "pid": 30628,
        "pm_id": 0,
        "name": "example-app",
        "namespace": "example",
        "status": "online",
        "uptime": 119676,
        "restarts": 3,
        "unstable_restarts": 0,
        "exec_mode": "fork_mode",
        "instances": 1,
        "interpreter": "C:\\Program Files\\nodejs\\node.exe",
        "cpu": 1.5,
        "memory": 9420800,
        "cwd": "C:\\Example\\Application",
        "ip_address": "192.168.1.10",
        "watch": false,
        "autorestart": true
      }
    ]
  }
}
```

---

### GET /system

Host-level metrics only (CPU utilization percentage and memory usage). Does **not** include the process list — use `GET /list?overview=true` for a combined host + processes view. Works even when the PM2 daemon is unavailable.

**Request:** no params, no body

**Response `200`:**

```json
{
  "success": true,
  "message": "System overview retrieved successfully",
  "info": {
    "host": {
      "cpu": {
        "usagePercent": 12.5
      },
      "memory": {
        "totalBytes": 17179869184,
        "freeBytes": 6012954214,
        "usedBytes": 11166914970,
        "percentUsed": 65
      }
    }
  }
}
```

> **Host metric notes:** `cpu.usagePercent` is measured between samples. The first sample after server start has no prior baseline, so systeminformation measures it over a short (~500 ms) window — that request may take slightly longer, and the server primes the baseline at startup. `memory.usedBytes` includes buffers/cache.

---

### GET /health

Liveness check for this API server itself (not the PM2 processes). Useful for uptime monitoring and load balancer probes.

**Request:** no params, no body

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 health check passed",
  "info": {
    "status": "ok",
    "uptime": 119.676,
    "timestamp": 1786687862669
  }
}
```

---

### GET /describe/:id

Fetches detailed info for a single process by its `pm_id`. Returns a **single object** (not an array) with three keys: `summary`, `describe`, and `metrics`. Unlike `/list`, returns 404 if the id does not exist.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`). Numeric strings are coerced; names are rejected. |

**Request:** `GET /pm2/describe/0`

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 process described successfully",
  "info": {
    "summary": {
      "pid": 30628,
      "pm_id": 0,
      "name": "xpm-agent",
      "namespace": "XPM",
      "status": "online",
      "uptime": 660000,
      "restarts": 0,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "bun",
      "cpu": 0.3,
      "memory": 51380224,
      "cwd": "C:\\Users\\markc\\Desktop\\DEVELOPMENT\\xpm-agent",
      "ip_address": "192.168.1.10",
      "watch": false,
      "autorestart": true
    },
    "describe": {
      "version": "1.1.2",
      "script_path": "C:\\Users\\markc\\Desktop\\DEVELOPMENT\\xpm-agent\\dist\\index.js",
      "script_args": null,
      "error_log_path": "C:\\Users\\markc\\.pm2\\logs\\xpm-agent-error-0.log",
      "out_log_path": "C:\\Users\\markc\\.pm2\\logs\\xpm-agent-out-0.log",
      "pid_path": "C:\\Users\\markc\\.pm2\\pids\\xpm-agent-0.pid",
      "interpreter_args": null,
      "node_version": "26.3.0",
      "node_env": "production",
      "created_at": "2026-09-19T02:29:06.651Z"
    },
    "metrics": {
      "Heap Size": { "value": "3.92", "unit": "MiB" },
      "Heap Usage": { "value": "100", "unit": "%" },
      "Used Heap Size": { "value": "3.92", "unit": "MiB" },
      "Active requests": { "value": "0", "unit": "" },
      "Active handles": { "value": "0", "unit": "" },
      "Event Loop Latency": { "value": "1.07", "unit": "ms" },
      "Event Loop Latency p95": { "value": "1.98", "unit": "ms" }
    }
  }
}
```

**`summary`** uses the same shape as every other route — see [ProcessSummary Fields](#processsummary-fields).

**`describe` fields:**

| Field | Type | Description |
|---|---|---|
| `version` | string \| null | App version as recorded by PM2 |
| `script_path` | string \| null | Resolved path of the launched script (`pm_exec_path`) |
| `script_args` | string \| string[] \| null | Raw arguments passed to the script (`args`) |
| `error_log_path` | string \| null | stderr log file path |
| `out_log_path` | string \| null | stdout log file path |
| `pid_path` | string \| null | PID file path |
| `interpreter_args` | string[] \| null | Interpreter arguments (`node_args`); `null` when empty |
| `node_version` | string \| null | Runtime version reported by the process — `null` for non-Node/Bun interpreters (e.g. Python, `none`) |
| `node_env` | string \| null | `NODE_ENV` from the process environment; `null` when unset |
| `created_at` | string \| null | Process creation time (ISO 8601); `null` when unavailable |
| `entire_log_path` | string | Combined log path — **only present when configured** |
| `cron_restart` | string | Cron restart expression — **only present when configured** |
| `max_memory_restart` | number \| string | Max-memory restart threshold — **only present when configured** |

> Non-conditional `describe` keys are always present and are `null` when PM2 reports no value. `entire_log_path`, `cron_restart`, and `max_memory_restart` are omitted entirely unless configured.

**`metrics`** is the raw `pm2_env.axm_monitor` map passed through verbatim (keys are metric names such as `Heap Size`; values are whatever pmx reports, typically `{ value, unit }`). It is `{}` for processes without pmx instrumentation (e.g. Python, Go, binaries).

**Error `404`** (unknown id):

```json
{ "success": false, "message": "Process 99 not found", "code": "PROCESS_NOT_FOUND", "info": null }
```

> When PM2 itself reports the process as missing, the message is the generic `"Process not found"` instead of the id-interpolated form.

**Error `422`** (non-numeric id, e.g. `/describe/server`):

```json
{
  "success": false,
  "message": "Validation failed: Property 'id' should be one of: 'numeric', 'number'",
  "code": "VALIDATION_FAILED",
  "info": null
}
```

---

### POST /start

Registers and launches a new process under PM2. `name`, `script`, and `interpreter` are **required**; every other field is an optional PM2 start option (plus the API-level `targetOs`) and is passed through **verbatim** — this API applies no PM2 defaults. When a field is omitted, PM2 applies its own built-in default (see [Defaults & provenance](#defaults--provenance) below).

The body is validated **twice**:

1. **Schema validation** — wrong types or missing required fields → `422` (handled by the API validation layer).
2. **Configuration guide** — cross-field checks that catch impossible or misleading combos (e.g. a `.js` script with `interpreter: "php"`) → `422` with the list of issues in `info`.

**Language recipes:**

`interpreter` must be an absolute path to the interpreter executable (or `"none"` for bare binaries) — bare names like `"node"`/`"php"` are rejected, and the path is validated against the declared `targetOs`.

| Language | `interpreter` | `script` | `args` |
|---|---|---|---|
| Node | `C:\Program Files\nodejs\node.exe` | `index.js` | `--port=3000` |
| Bun | `C:\Users\<user>\.bun\bin\bun.exe` | `index.ts` | — |
| PHP web | `C:\php\php.exe` | `server.php` | `-S 127.0.0.1:8080` |
| PHP artisan | `C:\php\php.exe` | `artisan` | `schedule:work` |
| Python | `C:\Python312\python.exe` | `app.py` | `--port 5000` |
| Go / binary | `none` | `./my-binary` | `--port 5000` |
| Shell / `.bat` | `none` | `start.bat` | — |

**Request body (Postman → Body → raw → JSON):**

```json
{
  "name": "example-app",
  "namespace": "example",
  "targetOs": "win32",
  "cwd": "C:\\Example\\Application",
  "script": ".output/server/index.mjs",
  "args": ["--port", "3000"],
  "interpreter": "C:\\Program Files\\nodejs\\node.exe",
  "interpreter_args": ["--env-file=.env"],
  "exec_mode": "fork",
  "instances": 1,
  "autorestart": true,
  "max_restarts": 10,
  "windowsHide": true,
  "watch": false
}
```

| Field | Type | Required | Description / default |
|---|---|---|---|
| `name` | string | **yes** | Process name shown in `pm2 list`. Used in log file names and lifecycle commands. |
| `namespace` | string | no | PM2 namespace. Defaults to `"default"` (pm2 built-in). Use to isolate same-named processes. |
| `targetOs` | `"win32"` \| `"linux"` | no | Target OS this process will run on — drives interpreter path validation. Defaults to `"win32"` (API-level default). On `win32`, both `C:\...` and `/...` absolute forms are accepted; on `linux` only POSIX absolute paths pass. |
| `cwd` | string | no | Working directory the process is launched from. **No pm2 default** — almost always set this. |
| `script` | string | **yes** | Path to the script to run. Resolved against the API server's cwd when `cwd` is omitted. |
| `args` | string \| string[] | no | Arguments passed to the script itself. No pm2 default. |
| `interpreter` | string | **yes** | Absolute path to the interpreter executable (e.g. `C:\Program Files\nodejs\node.exe`). **Required.** Use `"none"` when `script` is itself a binary. Bare names like `"node"`/`"php"` are rejected — only `"none"` is accepted as a bare value. Validated for the declared `targetOs`. |
| `interpreter_args` | string \| string[] | no | Arguments passed to the interpreter process (e.g. `--env-file=.env`, `--max-old-space-size=512`). Only supported for interpreters that accept extra args — Node/Bun and Python; rejected for PHP, Go, and `"none"`. No pm2 default. |
| `exec_mode` | `"fork"` \| `"cluster"` | no | Execution mode. Defaults to `"fork"` (pm2 built-in). `"cluster"` required for `instances > 1`; Node-family (Node/Bun) only. |
| `instances` | number \| `"max"` | no | Number of instances. Defaults to `1` (pm2 built-in). `"max"` = one per CPU core. Requires `exec_mode: "cluster"`. |
| `autorestart` | boolean | no | Restart automatically on crash. Defaults to `true` (pm2 built-in). Set `false` for one-shot jobs. |
| `max_restarts` | number | no | Consecutive unstable-restart limit (a crash within `min_uptime` of launch counts as unstable). At the limit, PM2 marks the process `errored` and stops. `0` = never restart — prefer `autorestart: false` for that. Defaults to `16` (pm2 built-in). |
| `windowsHide` | boolean | no | Hide the process console window on Windows. Defaults to `false` (pm2 built-in). **Recommended `true` on Windows hosts.** |
| `env` | object\<string, string\> | no | Environment variables injected into the spawned process. Defaults to `{}` (pm2 passes only this object, not the shell env). |
| `watch` | boolean \| string[] | no | Restart on file changes. `true` watches the whole tree; an array watches only those paths. Defaults to `false` (pm2 built-in). |
| `ignore_watch` | string[] | no | Paths/glob patterns excluded from `watch`. No pm2 default. Recommended `["node_modules", "logs", "*.log"]` when `watch` is on — otherwise pm2 restarts on its own log writes. |
| `watch_delay` | number | no | Delay (ms) before restarting a watched process after a change. **No pm2 default** — restarts fire immediately. |
| `cron_restart` | string | no | Cron expression to periodically restart the process, e.g. `"0 2 * * *"`. No pm2 default. |

**Defaults & provenance:**

Every default listed above is **PM2's own runtime default** — it is applied by PM2 when the field is omitted. This API passes your JSON through to PM2 unchanged and applies **no** PM2 defaults of its own. Provenance is stated per field: "(pm2 built-in)" = applied by PM2 if omitted; "No pm2 default" = nothing is applied and PM2 behaves as documented. The one API-level field is `targetOs`, whose default (`"win32"`) is applied by this API for validation.

**Log timestamps:** this API always starts processes with PM2's `time: true`, so every log line is prefixed with `[YYYY-MM-DD HH:mm:ss]`. Any `time` value in the payload is ignored.

**Configuration guide rules (each violation blocks with `422`):**

- `name` and `script` must be non-empty (whitespace-only values are rejected)
- `instances` must be a positive integer or `"max"`
- `interpreter` must be an absolute path for the declared `targetOs` — bare names like `"node"`/`"py"` are rejected (only `"none"` is accepted as a bare value). On `win32`, both `C:\...` and `/...` absolute forms pass; on `linux` only POSIX absolute paths pass
- Script extension must match the interpreter family — e.g. a Node-extension script (`.js`, `.mjs`, `.cjs`, `.ts`, …) with a `php`/`python`/`go` interpreter, or a `.php`/`.py`/`.go` script with a non-matching interpreter
- `artisan` requires a PHP interpreter executable path and `args` (a subcommand: `serve`, `schedule:work`, …); `manage.py` requires a Python interpreter path and `args`
- `interpreter_args` only with interpreters that support them (Node/Bun and Python) — rejected for PHP, Go, and `"none"`
- `exec_mode: "cluster"` with a non-Node-family interpreter (or `"none"`)
- `instances > 1` / `"max"` with `exec_mode: "fork"`

**Response `200`** — `info` is an array of `ProcessSummary`, one per launched instance:

```json
{
  "success": true,
  "message": "PM2 process started successfully",
  "info": [
    {
      "pid": 12345,
      "pm_id": 2,
      "name": "example-app",
      "namespace": "example",
      "status": "online",
      "uptime": 305,
      "restarts": 0,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "C:\\Program Files\\nodejs\\node.exe",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\Example\\Application",
      "ip_address": "192.168.1.10",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

Starting with `instances: 2` returns **2 rows** (one per cluster instance). To run a single process, omit `instances` (or set `exec_mode: "fork"`).

**Error `422`** (schema violation — e.g. missing `name`):

```json
{
  "success": false,
  "message": "Validation failed: Expected property 'name' to be string but found: undefined",
  "code": "VALIDATION_FAILED",
  "info": null
}
```

**Error `422`** (configuration guide violation — note `info` carries the issues):

```json
{
  "success": false,
  "message": "Invalid process configuration",
  "code": "INVALID_PROCESS_CONFIGURATION",
  "info": [
    {
      "field": "interpreter",
      "message": "interpreter must be an absolute path to the executable (e.g. 'C:\\Program Files\\nodejs\\node.exe'), not a bare name like 'node' or 'py' — only 'none' is accepted as a bare value"
    }
  ]
}
```

On a `targetOs: "linux"` payload the same violation reads `(e.g. '/usr/bin/node')`.

**Error `400`** (script path does not exist):

```json
{
  "success": false,
  "message": "Script not found — check the 'script' path in your request",
  "code": "SCRIPT_NOT_FOUND",
  "info": null
}
```

---

### POST /stop/:id

Gracefully stops a running process. The process stays **registered** in PM2 (status `"stopped"`) and can be started again via `POST /restart/:id`. To remove it entirely, use `DELETE /delete/:id`.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`) |

**Request:** `POST /pm2/stop/0` (no body)

**Response `200`** — `info` is an array of `ProcessSummary`:

```json
{
  "success": true,
  "message": "PM2 process stopped successfully",
  "info": [
    {
      "pid": 0,
      "pm_id": 0,
      "name": "example-app",
      "namespace": "example",
      "status": "stopped",
      "uptime": 0,
      "restarts": 3,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "C:\\Program Files\\nodejs\\node.exe",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\Example\\Application",
      "ip_address": "192.168.1.10",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

**Error `404`:**

```json
{ "success": false, "message": "Process not found", "code": "PROCESS_NOT_FOUND", "info": null }
```

---

### POST /restart/:id

Kills and re-launches a process. Also works on stopped processes (acts as start). Use after code or environment changes.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`) |

**Request:** `POST /pm2/restart/0` (no body)

**Response `200`** — `info` is an array of `ProcessSummary`:

```json
{
  "success": true,
  "message": "PM2 process restarted successfully",
  "info": [
    {
      "pid": 0,
      "pm_id": 0,
      "name": "example-app",
      "namespace": "example",
      "status": "online",
      "uptime": 305,
      "restarts": 4,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "C:\\Program Files\\nodejs\\node.exe",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\Example\\Application",
      "ip_address": "192.168.1.10",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

---

### POST /reload/:id

Zero-downtime reload — restarts instances one at a time. Only meaningful for **cluster mode** processes with multiple instances; falls back to a normal restart in fork mode.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`) |

**Request:** `POST /pm2/reload/0` (no body)

**Response `200`** — `info` is an array of `ProcessSummary`:

```json
{
  "success": true,
  "message": "PM2 process reloaded successfully",
  "info": [
    {
      "pid": 0,
      "pm_id": 0,
      "name": "example-app",
      "namespace": "example",
      "status": "online",
      "uptime": 305,
      "restarts": 4,
      "unstable_restarts": 0,
      "exec_mode": "cluster_mode",
      "instances": 2,
      "interpreter": "C:\\Program Files\\nodejs\\node.exe",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\Example\\Application",
      "ip_address": "192.168.1.10",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

---

### DELETE /delete/:id

Stops the process **and removes it from PM2's registry entirely**. The `pm_id` is freed and may be recycled by PM2 for future processes. Unlike stop, this cannot be undone via restart.

By default the process's log files (`-out.log` / `-error.log` in `~/.pm2/logs/`, or `$PM2_HOME/logs/` when `PM2_HOME` is set) are **left on disk** — PM2 never removes them. Pass `?delete_logs=true` to also delete them.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`) |

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `delete_logs` | boolean | no | When `true`, also deletes the process's `-out.log`/`-error.log` files from `~/.pm2/logs/` (or `$PM2_HOME/logs/`). Default `false`. |

**Request:** `DELETE /pm2/delete/0` (keep logs) or `DELETE /pm2/delete/0?delete_logs=true` (also remove log files)

**Response `200`** — `info` is an array of `ProcessSummary`:

```json
{
  "success": true,
  "message": "PM2 process deleted successfully",
  "info": [
    {
      "pid": 0,
      "pm_id": 0,
      "name": "example-app",
      "namespace": "example",
      "status": "stopped",
      "uptime": 0,
      "restarts": 4,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "C:\\Program Files\\nodejs\\node.exe",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\Example\\Application",
      "ip_address": "192.168.1.10",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

---

### POST /flush/:id

Clears (empties) the log files for one process. Does not affect running state.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`) |

**Request:** `POST /pm2/flush/0`

**Response `200`:**

```json
{
  "success": true,
  "message": "Logs for process 0 flushed successfully",
  "info": null
}
```

---

### GET /logs/:id

Returns the trailing lines of a process's stdout (`out`) and stderr (`error`) log files. `id` is the process's `pm_id`.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`) |

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `tail` | integer | no | Number of trailing log lines to return per stream. Default `50`. Minimum `1`, maximum `500`. |
| `type` | string | no | Which log stream to return. `"both"` (default), `"output"`, or `"error"`. |

**Request:** `GET /pm2/logs/0` or `GET /pm2/logs/0?tail=10&type=error`

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 process logs retrieved successfully",
  "info": {
    "out": ["log line 1", "log line 2"],
    "error": ["error line 1"]
  }
}
```

The `out` and `error` arrays contain the last N lines of each respective log file. If a log file does not exist (or a stream the process does not write), that array is empty. Returns `404` if the process `pm_id` is not found.

**Error `404`** (unknown pm_id):

```json
{ "success": false, "message": "Process 99 not found", "code": "PROCESS_NOT_FOUND", "info": null }
```

> When PM2 itself reports the process as missing, the message is the generic `"Process not found"` instead of the id-interpolated form.

**Error `422`** (invalid `tail` or `type`):

```json
{
  "success": false,
  "message": "Validation failed: Expected integer to be greater or equal to 1",
  "code": "VALIDATION_FAILED",
  "info": null
}
```

---

## ProcessSummary Fields

The `info` payload for `/list`, `/start`, `/stop/:id`, `/restart/:id`, `/reload/:id`, and `/delete/:id` — always an array of summaries. `GET /describe/:id` returns a **single object** with `summary` (this shape), `describe`, and `metrics` — see [GET /describe/:id](#get-describeid).

| Field | Type | Description |
|---|---|---|
| `pid` | number | OS process id (0 if not running, or on operation responses) |
| `pm_id` | number | PM2 internal id — **the id used in `:id` routes** |
| `name` | string | Process name |
| `namespace` | string | PM2 namespace (default: `"default"`) |
| `status` | string | `online`, `stopped`, `stopping`, `launching`, `errored`, ... |
| `uptime` | number | Elapsed time (ms) since the process last started; `0` when the process is not `online` |
| `restarts` | number | Total restart count |
| `unstable_restarts` | number | Consecutive unstable restarts |
| `exec_mode` | string | `fork_mode` or `cluster_mode` (falls back to `"fork"` if PM2 omits it) |
| `instances` | number \| undefined | Instance count (cluster mode); omitted when PM2 does not report it |
| `interpreter` | string | Absolute interpreter path (e.g. `C:\Program Files\nodejs\node.exe`), or `none` |
| `cpu` | number | Current CPU usage (%) — `0` on operation responses |
| `memory` | number | Current memory usage (bytes) — `0` on operation responses |
| `cwd` | string \| undefined | Working directory; omitted when PM2 does not report it |
| `ip_address` | string | Server IPv4 address the process runs on (e.g. `192.168.1.10`; `127.0.0.1` when no external interface) — same value for every process on the server |
| `logs` | object | `out` and `error` string arrays — only present when `?logs=N` is passed on `/list`; each stream capped at 500 lines. Omitted when no logs query |
| `watch` | boolean | File-watch enabled |
| `autorestart` | boolean \| undefined | Auto-restart on crash enabled; omitted when PM2 does not report it |

> **Note:** on `/start`, `/stop`, `/restart`, `/reload`, `/delete` responses, PM2 returns metadata-only snapshots, so `pid`, `cpu`, and `memory` may be `0`. Poll `GET /list` for live metrics.

## Error Statuses

| Status | `code` | When |
|---|---|---|
| 400 | `SCRIPT_NOT_FOUND` | Script path in the `/start` body does not exist |
| 400 | `PARSE` | Malformed JSON request body |
| 401 | `UNAUTHORIZED` | Missing or invalid `Authorization: Bearer <token>` header when `AUTH_TOKEN` is configured |
| 403 | `CORS_ORIGIN_NOT_ALLOWED` | Origin not in `CORS_ORIGIN` allowlist — browsers sending an `Origin` header without a configured allowlist are rejected |
| 404 | `PROCESS_NOT_FOUND` | Process with the given `pm_id` not found |
| 422 | `VALIDATION_FAILED` | Schema validation failed (non-numeric `id`, missing `name`/`script`/`interpreter` in the body) **or** an invalid `tail`/`type`/`logs` query |
| 422 | `INVALID_PROCESS_CONFIGURATION` | `/start` configuration-guide violation (e.g. `.js` script with a `php` interpreter) — the violations are listed in `info`, not `null` |
| 500 | `PM2_OPERATION_FAILED` | Unexpected PM2 failure — `message` is `"PM2 operation failed: <raw PM2 error>"` |
| 500 | `INTERNAL_SERVER_ERROR` / `UNKNOWN` | Unhandled server error |
| 503 | `PM2_DAEMON_UNAVAILABLE` | Cannot connect to the PM2 daemon |

All errors use the envelope with `success: false` and include a `code`; `info` is `null` except for the `/start` configuration-guide `422`, where it contains the list of violations. Unknown routes are the one exception — they return a plain-text `NOT_FOUND` 404 from Elysia's default handler.

## Lifecycle Notes

- `stop` keeps the process registered and restartable; `delete` removes it permanently and frees the `pm_id` (which PM2 may recycle).
- `:id` always means the numeric `pm_id` from `GET /list` — process **names are not accepted** (names can collide across namespaces).
- `instances > 1` (with `exec_mode: "cluster"`) launches one Node process per CPU instance — the response then contains **one row per instance**.
- `env` values injected via `/start` are applied to the spawned process only; they are **not echoed back** in responses (all responses are sanitized `ProcessSummary` snapshots). The one exception is `GET /describe/:id`, whose `describe`/`metrics` keys additionally expose `pm_exec_path`, the log/pid paths, `NODE_ENV`, and raw code metrics — but no other env values.
- `namespace` is normalized and enforced by the API: when omitted it is sent to PM2 as `"default"`, and the resolved value is also mirrored into the process `env` so the payload's `namespace` always wins over the namespace inherited from the agent's own PM2 environment.
- `/start` passes every field through to PM2 verbatim — it applies no PM2 defaults of its own (see [Defaults & provenance](#defaults--provenance)), with `namespace` as the one exception (normalized to `"default"` when omitted). The only API-level field is `targetOs` (used for interpreter-path validation, default `"win32"`), and `time` is always forced to `true` so log lines carry timestamps.
- `windowsHide` is **recommended `true` on Windows hosts** (pm2's own default is `false`) to avoid a spawned console window per process.
- **Name/namespace are immutable after start** — PM2 has no rename. To rename, `delete` (optionally with `delete_logs: true`) and `start` under the new name. Logs are named after the name/namespace, so a rename starts new `-out.log`/`-error.log` files.
