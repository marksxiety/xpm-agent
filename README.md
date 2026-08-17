# PM2 Process Manager API

REST API for managing [PM2](https://pm2.io/) processes. Built with [Elysia](https://elysiajs.com/) on the Bun runtime.

## Quick start

```bash
bun install
bun run dev
```

The server listens on `http://localhost:4000` by default (override with `SERVER_PORT`).

- Interactive docs: <http://localhost:4000/swagger>
- API reference: [ROUTES.md](./ROUTES.md)

## What it does

Identifies processes by their numeric `pm_id` (see `GET /pm2/list`) and exposes the full lifecycle:

| Route | Method | Purpose |
|---|---|---|
| `/pm2/list` | GET | List all processes with live CPU/memory/restarts |
| `/pm2/health` | GET | API liveness check |
| `/pm2/describe/:id` | GET | Details for one process |
| `/pm2/start` | POST | Register and launch a new process |
| `/pm2/stop/:id` | POST | Stop (keep registered) |
| `/pm2/restart/:id` | POST | Kill and relaunch |
| `/pm2/reload/:id` | POST | Zero-downtime reload (cluster mode) |
| `/pm2/delete/:id` | DELETE | Stop and remove permanently |
| `/pm2/flush/:id?` | POST | Empty log files (all if id omitted) |

## Starting a process

Only `script` is required. Every process is `interpreter` + `script` + `args`, so any language works:

```json
{
  "script": "C:\\apps\\my-service\\index.js",
  "name": "my-service",
  "exec_mode": "fork",
  "interpreter": "node",
  "node_args": "--env-file=.env",
  "args": "--port 3000",
  "env": { "NODE_ENV": "production" },
  "autorestart": true
}
```

Language recipes (Node, Bun, PHP, Python, Go/binary, shell) are in [ROUTES.md](./ROUTES.md).

## Notes

- Every response uses a uniform envelope: `{ success, message, info }`.
- All process payloads are sanitized `ProcessSummary` snapshots — full `pm2_env` (including environment variables) is never exposed.
- `instances > 1` requires `exec_mode: "cluster"` (Node only) and returns one row per instance.
- This API is an internal ops tool; it accepts arbitrary `env` and `args`, so keep it on a trusted network only.

## Development

```bash
bun run dev        # watch mode
bun run typecheck  # tsc --noEmit
```
