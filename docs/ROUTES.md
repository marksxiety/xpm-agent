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
| `info` | any | The actual payload on success; `null` on error |

> **Exception:** the `/start` configuration-guide `422` returns the list of violations in `info` (an array of `{ field, message }`), not `null` — see [POST /start](#post-start).

---

## Routes

### GET /list

Returns all PM2-managed processes with live CPU, memory, restart counts, and status. Use this first to discover the `pm_id` values required by other routes.

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `logs` | integer | no | When present, attaches `logs: { out, error }` to each process summary with the trailing N lines of each stream (1–500, default 50). Omit for a lightweight list without logs. |
| `overview` | boolean | no | When `true`, returns an object with two keys: `overview` (host-level metrics: CPU cores, model, load average, memory) and `processes` (the process summaries). The `logs` param, if provided, still applies to each process summary. |

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
      "uptime": 1786687862669,
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
        "cores": 8,
        "model": "Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz",
        "loadAvg": [0.42, 0.35, 0.29]
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
        "uptime": 1786687862669,
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

Host-level metrics only (CPU cores, model, load average, memory usage). Does **not** include the process list — use `GET /list?overview=true` for a combined host + processes view. Works even when the PM2 daemon is unavailable.

**Request:** no params, no body

**Response `200`:**

```json
{
  "success": true,
  "message": "System overview retrieved successfully",
  "info": {
    "host": {
      "cpu": {
        "cores": 8,
        "model": "Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz",
        "loadAvg": [0.42, 0.35, 0.29]
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
    "timestamp": "2026-08-17T02:08:12.991Z"
  }
}
```

---

### GET /describe/:id

Fetches detailed info for a single process by its `pm_id`. Unlike `/list`, returns 404 if the id does not exist.

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
  "info": [
    {
      "pid": 30628,
      "pm_id": 0,
      "name": "example-app",
      "namespace": "example",
      "status": "online",
      "uptime": 1786687862669,
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

**Error `404`** (unknown id):

```json
{ "success": false, "message": "Process not found", "info": null }
```

**Error `422`** (non-numeric id, e.g. `/describe/server`):

```json
{
  "success": false,
  "message": "Validation failed: Property 'id' should be one of: 'numeric', 'number'",
  "info": null
}
```

---

### POST /start

Registers and launches a new process under PM2. `name`, `script`, and `interpreter` are **required**; every other field is an optional PM2 start option and is passed through **verbatim** — this API applies no defaults. When a field is omitted, PM2 applies its own built-in default (see [Defaults & provenance](#defaults--provenance) below).

The body is validated **twice**:

1. **Schema validation** — wrong types or missing required fields → `422` (handled by the API validation layer).
2. **Configuration guide** — cross-field checks that catch impossible or misleading combos (e.g. a `.js` script with `interpreter: "php"`) → `422` with the list of issues in `info`.

**Language recipes:**

`interpreter` must be an absolute path to the interpreter executable (or `"none"` for bare binaries) — bare names like `"node"`/`"php"` are rejected.

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
| `cwd` | string | no | Working directory the process is launched from. **No pm2 default** — almost always set this. |
| `script` | string | **yes** | Path to the script to run. Resolved against the API server's cwd when `cwd` is omitted. |
| `args` | string \| string[] | no | Arguments passed to the script itself. No pm2 default. |
| `interpreter` | string | **yes** | Absolute path to the interpreter executable (e.g. `C:\Program Files\nodejs\node.exe`). **Required.** Use `"none"` when `script` is itself a binary. Bare names like `"node"`/`"php"` are rejected — only `"none"` is accepted as a bare value. |
| `interpreter_args` | string \| string[] | no | Arguments passed to the interpreter process (e.g. `--env-file=.env`, `--max-old-space-size=512`). Node-family only. No pm2 default. |
| `exec_mode` | `"fork"` \| `"cluster"` | no | Execution mode. Defaults to `"fork"` (pm2 built-in). `"cluster"` required for `instances > 1`; Node-only. |
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

Every default listed above is **PM2's own runtime default** — it is applied by PM2 when the field is omitted. This API passes your JSON through to PM2 unchanged and applies **no** defaults of its own. Provenance is stated per field: "(pm2 built-in)" = applied by PM2 if omitted; "No pm2 default" = nothing is applied and PM2 behaves as documented.

**Configuration guide rules (each violation blocks with `422`):**

- `interpreter` not an absolute path — bare names like `"node"`/`"php"` are rejected (only `"none"` is accepted as a bare value)
- Node-extension script (`.js`, `.mjs`, `.cjs`, `.ts`, …) with a `php`/`python` interpreter
- `artisan` or `.php` script without a PHP interpreter executable path
- `artisan` script with no `args` (artisan needs a subcommand: `serve`, `schedule:work`, …)
- `interpreter_args` with a non-node-family interpreter
- `exec_mode: "cluster"` with a non-node-family interpreter
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
      "uptime": 1786687862669,
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
  "info": null
}
```

**Error `422`** (configuration guide violation — note `info` carries the issues):

```json
{
  "success": false,
  "message": "Invalid process configuration",
  "info": [
    {
      "field": "interpreter",
      "message": "interpreter must be an absolute path to the executable (e.g. 'C:\\Program Files\\nodejs\\node.exe'), not a bare name like 'node' — only 'none' is accepted as a bare value"
    }
  ]
}
```

**Error `400`** (script path does not exist):

```json
{
  "success": false,
  "message": "Script not found — check the 'script' path in your request",
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
      "uptime": 1786687862669,
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
{ "success": false, "message": "Process not found", "info": null }
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
      "uptime": 1786687862669,
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
      "uptime": 1786687862669,
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

By default the process's log files (`-out.log` / `-error.log` in `~/.pm2/logs/`) are **left on disk** — PM2 never removes them. Pass `?delete_logs=true` to also delete them.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`) |

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `delete_logs` | boolean | no | When `true`, also deletes the process's `-out.log`/`-error.log` files from `~/.pm2/logs/`. Default `false`. |

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
      "uptime": 1786687862669,
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
{ "success": false, "message": "Process not found", "info": null }
```

**Error `422`** (invalid `tail` or `type`):

```json
{ "success": false, "message": "Validation failed: ..., "info": null }
```

---

## ProcessSummary Fields

The `info` payload for `/list`, `/describe/:id`, `/start`, `/stop/:id`, `/restart/:id`, `/reload/:id`, and `/delete/:id` — always an array of summaries.

| Field | Type | Description |
|---|---|---|
| `pid` | number | OS process id (0 if not running, or on operation responses) |
| `pm_id` | number | PM2 internal id — **the id used in `:id` routes** |
| `name` | string | Process name |
| `namespace` | string | PM2 namespace (default: `"default"`) |
| `status` | string | `online`, `stopped`, `stopping`, `launching`, `errored`, ... |
| `uptime` | number | Epoch timestamp (ms) of last start |
| `restarts` | number | Total restart count |
| `unstable_restarts` | number | Consecutive unstable restarts |
| `exec_mode` | string | `fork_mode` or `cluster_mode` |
| `instances` | number | Instance count (cluster mode) |
| `interpreter` | string | Absolute interpreter path (e.g. `C:\Program Files\nodejs\node.exe`), or `none` |
| `cpu` | number | Current CPU usage (%) — `0` on operation responses |
| `memory` | number | Current memory usage (bytes) — `0` on operation responses |
| `cwd` | string | Working directory |
| `ip_address` | string | Server IPv4 address the process runs on (e.g. `192.168.1.10`; `127.0.0.1` when no external interface) — same value for every process on the server |
| `logs` | object | `out` and `error` string arrays — only present when `?logs=N` is passed on `/list`; each stream capped at 500 lines (default 50). Omitted when no logs query |
| `watch` | boolean | File-watch enabled |
| `autorestart` | boolean | Auto-restart on crash enabled |

> **Note:** on `/start`, `/stop`, `/restart`, `/reload`, `/delete` responses, PM2 returns metadata-only snapshots, so `pid`, `cpu`, and `memory` may be `0`. Poll `GET /list` for live metrics.

## Error Statuses

| Status | When |
|---|---|
| 401 | Missing or invalid `Authorization: Bearer <token>` header when `AUTH_TOKEN` is configured |
| 422 | Schema validation failed (non-numeric `id`, missing `name`/`script` in body) **or** a `/start` configuration-guide violation (e.g. `.js` script with `php` interpreter) **or** invalid `tail`/`type` query on `/logs` |
| 404 | Process with the given `pm_id` not found |
| 403 | Origin not in `CORS_ORIGIN` allowlist (`CORS_ORIGIN_NOT_ALLOWED`) — browsers sending an `Origin` header without a configured allowlist are rejected |
| 400 | Script path in `/start` body not found |
| 503 | Cannot connect to the PM2 daemon |
| 500 | Unexpected PM2 failure |

All errors use the envelope with `success: false`; `info` is `null` except for the `/start` configuration-guide `422`, where it contains the list of violations.

## Lifecycle Notes

- `stop` keeps the process registered and restartable; `delete` removes it permanently and frees the `pm_id` (which PM2 may recycle).
- `:id` always means the numeric `pm_id` from `GET /list` — process **names are not accepted** (names can collide across namespaces).
- `instances > 1` (with `exec_mode: "cluster"`) launches one Node process per CPU instance — the response then contains **one row per instance**.
- `env` values injected via `/start` are applied to the spawned process only; they are **not echoed back** in responses (all responses are sanitized `ProcessSummary` snapshots).
- `/start` passes every field through to PM2 verbatim — it applies no defaults and no environment variables of its own (see [Defaults & provenance](#defaults--provenance)).
- `windowsHide` is **recommended `true` on Windows hosts** (pm2's own default is `false`) to avoid a spawned console window per process.
- **Name/namespace are immutable after start** — PM2 has no rename. To rename, `delete` (optionally with `delete_logs: true`) and `start` under the new name. Logs are named after the name/namespace, so a rename starts new `-out.log`/`-error.log` files.
