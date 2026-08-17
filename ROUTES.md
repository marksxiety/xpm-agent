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

Registers and launches a new process under PM2. PM2 will keep the process alive according to its `autorestart`/`watch` settings.

**Request body (Postman → Body → raw → JSON):**

```json
{
  "script": "C:\\apps\\my-service\\index.js",
  "name": "my-service",
  "namespace": "DPR",
  "cwd": "C:\\apps\\my-service",
  "instances": 2,
  "interpreter": "node",
  "watch": false,
  "autorestart": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `script` | string | **yes** | Path to the script to run |
| `name` | string | no | Process name shown in pm2 list |
| `namespace` | string | no | PM2 namespace; defaults to `"default"`. Use to isolate same-named processes. |
| `cwd` | string | no | Working directory for the script |
| `instances` | number \| string | no | Number of instances (cluster mode) |
| `interpreter` | string | no | Interpreter to use: `node`, `bun`, `none`, ... |
| `watch` | boolean | no | Restart on file changes |
| `autorestart` | boolean | no | Restart automatically on crash |

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 process started successfully",
  "info": {
    "name": "my-service",
    "pm_id": 2,
    "pid": 12345
  }
}
```

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

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 process stopped successfully",
  "info": {
    "name": "client",
    "pm_id": 0
  }
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

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 process restarted successfully",
  "info": {
    "name": "client",
    "pm_id": 0
  }
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

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 process reloaded successfully",
  "info": {
    "name": "client",
    "pm_id": 0
  }
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

**Response `200`:**

```json
{
  "success": true,
  "message": "PM2 process deleted successfully",
  "info": {
    "name": "client",
    "pm_id": 0
  }
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

The `info` payload for `/list` and `/describe/:id`:

| Field | Type | Description |
|---|---|---|
| `pid` | number | OS process id (0 if not running) |
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
| `cpu` | number | Current CPU usage (%) |
| `memory` | number | Current memory usage (bytes) |
| `cwd` | string | Working directory |
| `watch` | boolean | File-watch enabled |
| `autorestart` | boolean | Auto-restart on crash enabled |

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
