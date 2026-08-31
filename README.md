<h1 align="center">xpm-agent</h1>

<p align="center">
  <a href="https://github.com/marksxiety/xpm-agent/actions/workflows/tests.yml"><img src="https://github.com/marksxiety/xpm-agent/actions/workflows/tests.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/marksxiety/xpm-agent/actions/workflows/lint.yml"><img src="https://github.com/marksxiety/xpm-agent/actions/workflows/lint.yml/badge.svg" alt="Lint"></a>
  <a href="https://github.com/marksxiety/xpm-agent/actions/workflows/build.yml"><img src="https://github.com/marksxiety/xpm-agent/actions/workflows/build.yml/badge.svg" alt="Build"></a>
  <a href="https://github.com/marksxiety/xpm-agent/releases/latest"><img src="https://img.shields.io/github/v/release/marksxiety/xpm-agent?label=release&include_prereleases" alt="Release"></a>
</p>

<p align="center"><b>PM2, but make it an API — one agent per server.</b></p>

<p align="center">xpm-agent is a <b>cross-server agent</b>: install it on every machine that runs PM2, and drive all of them from a single place — no SSH-ing in per server. This Bun + Elysia service is a <b>thin REST wrapper around PM2</b>. It exposes PM2's full lifecycle (list, start, stop, restart, reload, delete, flush, logs) as clean endpoints so ops scripts, dashboards, and automations can manage any server's processes like any other API.</p>

> **PM2 does the real work.** This agent does not reimplement process management — it connects to PM2's daemon and relays your HTTP commands to it. PM2 handles daemonization, restarts, log rotation, and persistence; the agent just makes PM2 callable over HTTP.

> **Platform support: Windows only, for now.** Boot-time integration relies on `pm2-windows-startup`. Linux/macOS support isn't implemented yet.

## Prerequisites

- **Bun** — required. Runtime and package manager for this project.
- **Node.js** — required for npm (used to run package scripts).

## Quickstart

```cmd
git clone https://github.com/marksxiety/xpm-agent.git
cd xpm-agent
bun install
copy .env.example .env
bun run start
```

Then verify it's up:

```cmd
curl http://localhost:<PORT>/pm2/health
```

See [SETUP.md](./docs/SETUP.md) for full configuration options.

## Libraries

- **[pm2](https://pm2.io/)** — the actual process manager. This agent is a wrapper around it: it connects to PM2's daemon and relays your HTTP commands; PM2 itself does the daemonization, restarts, and log rotation.
- **[pm2-windows-startup](https://www.npmjs.com/package/pm2-windows-startup)** — boots PM2 (and your processes) automatically when Windows starts.
- **[ElysiaJS](https://elysiajs.com/)** — the HTTP framework powering the REST endpoints.
- **[@elysiajs/swagger](https://github.com/elysiajs/documentation)** — interactive API docs at `/swagger`.

## Routes at a glance

| Route | Method | Purpose |
|---|---|---|
| `/pm2/list` | GET | List all processes with live CPU/memory/restarts (optional `?overview=true`, `?logs=N`) |
| `/pm2/system` | GET | Host-level metrics only (CPU cores, model, load, memory) |
| `/pm2/health` | GET | API liveness check |
| `/pm2/describe/:id` | GET | Details for one process |
| `/pm2/start` | POST | Register and launch a new process |
| `/pm2/stop/:id` | POST | Stop (keep registered) |
| `/pm2/restart/:id` | POST | Kill and relaunch |
| `/pm2/reload/:id` | POST | Zero-downtime reload (cluster mode) |
| `/pm2/delete/:id` | DELETE | Stop and remove permanently |
| `/pm2/logs/:id` | GET | Tail a process's `out`/`error` logs (last N lines) |
| `/pm2/flush/:id` | POST | Empty a process's log files |

## Authentication

Optional bearer token. Set `AUTH_TOKEN` in `.env` (or `.env.production` when running in production) and every `/pm2/*` request must send `Authorization: Bearer <AUTH_TOKEN>` or it is rejected with `401`. Leave it empty to disable auth. No database — just a single shared secret. See [SETUP.md](./docs/SETUP.md).

> CORS only blocks browsers — curl, scripts, and servers bypass it entirely. Set `AUTH_TOKEN` whenever the agent runs on anything but a strictly localhost port.

## Documentation

| File | What it covers |
|---|---|
| [SETUP.md](./docs/SETUP.md) | Install, configure, and run the service under PM2 |
| [ROUTES.md](./docs/ROUTES.md) | Full API reference — routes, envelopes, language recipes |
| [PM2 REFERENCE](./docs/PM2_payload_reference.md) | Every field accepted by `POST /pm2/start` |