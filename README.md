<h1 align="center">x-process-manager-api</h1>

<p align="center">
  <a href="https://github.com/marksxiety/x-process-manager-api/actions/workflows/tests.yml"><img src="https://github.com/marksxiety/x-process-manager-api/actions/workflows/tests.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/marksxiety/x-process-manager-api/actions/workflows/lint.yml"><img src="https://github.com/marksxiety/x-process-manager-api/actions/workflows/lint.yml/badge.svg" alt="Lint"></a>
  <a href="https://github.com/marksxiety/x-process-manager-api/releases/latest"><img src="https://img.shields.io/github/v/release/marksxiety/x-process-manager-api?label=release&include_prereleases" alt="Release"></a>
</p>

<p align="center"><b>PM2, but make it an API.</b> Stop SSH-ing in just to restart a process. This Bun + Elysia service exposes PM2's full lifecycle (list, start, stop, restart, reload, delete, flush) as clean REST endpoints — so ops scripts, dashboards, and automations can drive PM2 like any other API.</p>

## Prerequisites

- **Bun** — required. Runtime and package manager for this project.
- **npm** — used for running package scripts (comes with Node.js).

## Libraries

- **[pm2](https://pm2.io/)** — the process manager this API drives; handles daemonization, restarts, and log rotation.
- **[pm2-windows-startup](https://www.npmjs.com/package/pm2-windows-startup)** — boots PM2 (and your processes) automatically when Windows starts.
- **[ElysiaJS](https://elysiajs.com/)** — the HTTP framework powering the REST endpoints.
- **[@elysiajs/swagger](https://github.com/elysiajs/documentation)** — interactive API docs at `/swagger`.

## Routes at a glance

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

## Documentation

| File | What it covers |
|---|---|
| [SETUP.md](./docs/SETUP.md) | Install, configure, and run the service under PM2 |
| [ROUTES.md](./docs/ROUTES.md) | Full API reference — routes, envelopes, language recipes |
| [PM2 REFERENCE](./docs/PM2_payload_reference.md) | Every field accepted by `POST /pm2/start` |