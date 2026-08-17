# PM2 API Reference

Base URL: `http://localhost:4000/pm2` (override port via `SERVER_PORT` env)

Interactive docs: [Swagger UI](http://localhost:4000/swagger)

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

---

## Routes

### GET /list

Returns all PM2-managed processes with live CPU, memory, restart counts, and status. Use this first to discover the `pm_id` values required by other routes.

**Request:** no params, no body

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 process list retrieved successfully",
  "info": [
    {
      "pid": 30628,
      "pm_id": 0,
      "name": "client",
      "namespace": "DPR",
      "status": "online",
      "uptime": 1786687862669,
      "restarts": 3,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "none",
      "cpu": 1.5,
      "memory": 9420800,
      "cwd": "C:\\apps\\daily-production-report",
      "watch": false,
      "autorestart": true
    }
  ]
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
      "name": "client",
      "namespace": "DPR",
      "status": "online",
      "uptime": 1786687862669,
      "restarts": 3,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "none",
      "cpu": 1.5,
      "memory": 9420800,
      "cwd": "C:\\apps\\daily-production-report",
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

Registers and launches a new process under PM2. PM2 will keep the process alive according to its `autorestart`/`watch`/`cron_restart` settings.

The API is language-agnostic: every process is `interpreter` + `script` + `args`. Pick the combination that fits your runtime.

**Language recipes:**

| Language | `interpreter` | `script` | `args` |
|---|---|---|---|
| Node | `node` (default) | `index.js` | `--port=3000` |
| Bun | `bun` | `index.ts` | — |
| PHP web | `php` | `server.php` | `-S 127.0.0.1:8080` |
| PHP artisan | `php` | `artisan` | `schedule:run` |
| Python | `python` | `app.py` | `--port 5000` |
| Go / binary | `none` | `./my-binary` | `--port 5000` |
| Shell / `.bat` | `none` | `start.bat` | — |

**Request body (Postman → Body → raw → JSON):**

```json
{
  "script": "C:\\apps\\my-service\\index.js",
  "name": "my-service",
  "namespace": "DPR",
  "cwd": "C:\\apps\\my-service",
  "exec_mode": "fork",
  "interpreter": "node",
  "node_args": "--env-file=.env",
  "args": "--port 3000",
  "env": {
    "NODE_ENV": "production"
  },
  "watch": false,
  "autorestart": true,
  "cron_restart": "*/5 * * * *"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `script` | string | **yes** | Path to the script to run |
| `name` | string | no | Process name shown in pm2 list |
| `namespace` | string | no | PM2 namespace; defaults to `"default"`. Use to isolate same-named processes. |
| `cwd` | string | no | Working directory for the script |
| `instances` | number \| string | no | Number of instances (`1`, `2`, `"max"`). **One `ProcessSummary` row is returned per instance.** Requires `exec_mode: "cluster"`; Node only. |
| `exec_mode` | `"fork"` \| `"cluster"` | no | Execution mode. `"cluster"` is required for `instances > 1`. Defaults to `"fork"`. |
| `interpreter` | string | no | Interpreter: `node`, `bun`, `python`, `php`, or `none` (script itself is executable). Defaults to `node`. |
| `node_args` | string \| string[] | no | Arguments to the **interpreter** (Node/Bun only), e.g. `--env-file=.env`. |
| `args` | string \| string[] | no | Arguments to the **script** itself, e.g. `-S 127.0.0.1:8080 server.php`. |
| `env` | object\<string, string\> | no | Environment variables injected into the spawned process. |
| `watch` | boolean | no | Restart on file changes |
| `autorestart` | boolean | no | Restart automatically on crash |
| `cron_restart` | string | no | Cron expression to periodically restart the process, e.g. `*/5 * * * *`. |

**Response `200`** — `info` is an array of `ProcessSummary`, one per launched instance:

```json
{
  "success": true,
  "message": "PM2 process started successfully",
  "info": [
    {
      "pid": 12345,
      "pm_id": 2,
      "name": "my-service",
      "namespace": "DPR",
      "status": "online",
      "uptime": 1786687862669,
      "restarts": 0,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "node",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\apps\\my-service",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

Starting with `instances: 2` returns **2 rows** (one per cluster instance). To run a single process, omit `instances` (or set `exec_mode: "fork"`).

**Error `422`** (missing `script`):

```json
{
  "success": false,
  "message": "Validation failed: Expected property 'script' to be string but found: undefined",
  "info": null
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
      "name": "client",
      "namespace": "DPR",
      "status": "stopped",
      "uptime": 1786687862669,
      "restarts": 3,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "node",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\apps\\daily-production-report",
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
      "name": "client",
      "namespace": "DPR",
      "status": "online",
      "uptime": 1786687862669,
      "restarts": 4,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "node",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\apps\\daily-production-report",
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
      "name": "client",
      "namespace": "DPR",
      "status": "online",
      "uptime": 1786687862669,
      "restarts": 4,
      "unstable_restarts": 0,
      "exec_mode": "cluster_mode",
      "instances": 2,
      "interpreter": "node",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\apps\\daily-production-report",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

---

### DELETE /delete/:id

Stops the process **and removes it from PM2's registry entirely**. The `pm_id` is freed and may be recycled by PM2 for future processes. Unlike stop, this cannot be undone via restart.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | `pm_id` of the process (from `GET /list`) |

**Request:** `DELETE /pm2/delete/0` (no body)

**Response `200`** — `info` is an array of `ProcessSummary`:

```json
{
  "success": true,
  "message": "PM2 process deleted successfully",
  "info": [
    {
      "pid": 0,
      "pm_id": 0,
      "name": "client",
      "namespace": "DPR",
      "status": "stopped",
      "uptime": 1786687862669,
      "restarts": 4,
      "unstable_restarts": 0,
      "exec_mode": "fork_mode",
      "instances": 1,
      "interpreter": "node",
      "cpu": 0,
      "memory": 0,
      "cwd": "C:\\apps\\daily-production-report",
      "watch": false,
      "autorestart": true
    }
  ]
}
```

---

### POST /flush/:id?

Clears (empties) the log files for one process, or for **all** processes if the id is omitted. Does not affect running state.

**Path params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | no | `pm_id` of the process; omit to flush **all** processes |

**Request:** `POST /pm2/flush/0` (flush one) or `POST /pm2/flush` (flush all)

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 logs flushed successfully",
  "info": null
}
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
| `interpreter` | string | Interpreter used (`node`, `bun`, `none`, ...) |
| `cpu` | number | Current CPU usage (%) — `0` on operation responses |
| `memory` | number | Current memory usage (bytes) — `0` on operation responses |
| `cwd` | string | Working directory |
| `watch` | boolean | File-watch enabled |
| `autorestart` | boolean | Auto-restart on crash enabled |

> **Note:** on `/start`, `/stop`, `/restart`, `/reload`, `/delete` responses, PM2 returns metadata-only snapshots, so `pid`, `cpu`, and `memory` may be `0`. Poll `GET /list` for live metrics.

## Error Statuses

| Status | When |
|---|---|
| 422 | Validation failed (non-numeric `id`, missing `script` in body) |
| 404 | Process with the given `pm_id` not found |
| 400 | Script path in `/start` body not found |
| 503 | Cannot connect to the PM2 daemon |
| 500 | Unexpected PM2 failure |

All errors use the envelope with `success: false` and `info: null`.

## Lifecycle Notes

- `stop` keeps the process registered and restartable; `delete` removes it permanently and frees the `pm_id` (which PM2 may recycle).
- `:id` always means the numeric `pm_id` from `GET /list` — process **names are not accepted** (names can collide across namespaces).
- `instances > 1` (with `exec_mode: "cluster"`) launches one Node process per CPU instance — the response then contains **one row per instance**.
- `env` values injected via `/start` are applied to the spawned process only; they are **not echoed back** in responses (all responses are sanitized `ProcessSummary` snapshots).
