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

One-time setup (skip a step if it is already done):

- **Install Bun** — skip if `bun --version` works. Do not re-run while Bun processes are running: the installer replaces `bun.exe` and fails if it is locked (e.g. the agent is live under PM2).

  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```

- **Install PM2 globally** — skip if `pm2 -v` works. The boot task registered below runs a bare `pm2 resurrect`, so `pm2` must be on `PATH`.

  ```cmd
  bun install -g pm2
  ```

Then clone and start:

```cmd
git clone https://github.com/marksxiety/xpm-agent.git
cd xpm-agent
bun install
bunx pm2-startup install
if not exist .env copy .env.example .env
if not exist .env.production copy .env.example .env.production
bun run start
```

> Set `AUTH_TOKEN` in `.env` and `.env.production` before `bun run start` — the agent refuses to boot without it. For local development only, `ALLOW_INSECURE=true` is the explicit escape hatch.

> `bunx pm2-startup install` registers boot auto-start. It must run **after** `bun install` — the `pm2-startup` binary ships with the `pm2-windows-startup` dependency, not npm. Re-running it is safe; undo with `bunx pm2-startup uninstall`.

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
- **[systeminformation](https://systeminformation.io/)** — cross-platform host metrics (CPU usage, memory) behind `/pm2/system` and `/pm2/list?overview=true`.

## Routes at a glance

| Route | Method | Purpose |
|---|---|---|
| `/pm2/list` | GET | List all processes with live CPU/memory/restarts (optional `?overview=true`, `?logs=N`) |
| `/pm2/system` | GET | Host-level metrics only (CPU usage, memory) |
| `/pm2/health` | GET | API liveness check |
| `/pm2/describe/:id` | GET | Details + code metrics for one process (`summary`, `describe`, `metrics`) |
| `/pm2/start` | POST | Register and launch a new process |
| `/pm2/stop/:id` | POST | Stop (keep registered) |
| `/pm2/restart/:id` | POST | Kill and relaunch |
| `/pm2/reload/:id` | POST | Graceful restart (fork mode falls back to a normal restart) |
| `/pm2/delete/:id` | DELETE | Stop and remove permanently |
| `/pm2/logs/:id` | GET | Tail a process's `out`/`error` logs (last N lines) |
| `/pm2/flush/:id` | POST | Empty a process's log files |

## Authentication

**Required.** Set `AUTH_TOKEN` in `.env` (or `.env.production` when running in production) and every `/pm2/*` request must send `Authorization: Bearer <AUTH_TOKEN>` or it is rejected with `401`. The agent refuses to boot without a token because `POST /pm2/start` executes code by design.

For local development only, `ALLOW_INSECURE=true` boots the agent without authentication and logs a warning on every start. Never enable it on a reachable host.

> CORS only blocks browsers — curl, scripts, and servers bypass it entirely. `AUTH_TOKEN` is the only access control.

> **Breaking API changes:** `cwd` is now required, unknown payload keys are rejected with `422` (no silent stripping), and `exec_mode: 'cluster'` / `instances > 1` are rejected. Update xpm-client (send `cwd`, drop cluster, tolerate `422`) before upgrading an agent.

## Security model

`POST /pm2/start` launches an arbitrary script as the service account — treat the agent as remote code execution by design and protect it accordingly.

What the agent enforces:

- `cwd` is required, absolute, free of `..` segments, never the agent's own directory, and inside `APP_ROOTS` when that allowlist is configured.
- `exec_mode` is always `fork` with `instances: 1` — PM2 cluster workers fork from the daemon and would inherit its environment.
- The child environment is exactly the payload `env` plus PM2 runtime metadata. Reserved PM2 keys and runtime loader options (`NODE_OPTIONS`, `BUN_OPTIONS`, `NODE_PATH`, `PYTHONSTARTUP`/`PYTHONPATH`, `PHPRC`, `PHP_INI_SCAN_DIR`, `LD_PRELOAD`) are rejected with `422`.
- Interpreter executables must be a recognized runtime (`node`, `bun`, `php`, `python`, `go`); `interpreter: "none"` additionally requires `AUTH_TOKEN`.
- `interpreter_args` are allowlisted per runtime: `--max-old-space-size=<n>` and `--env-file` pointing inside `cwd` (Node/Bun), `-O/-OO/-u/-B` (Python). Everything else is rejected.
- `name`/`namespace` are restricted to `^[A-Za-z0-9._-]{1,64}$`; the agent's own processes (`xpm-agent`/`xpm-client`/`xpm-server` in the `XPM` namespace) cannot be started or managed, and `describe`/`logs`/`flush` refuse them too. If the guard cannot inspect a target, the request fails closed with `503`.
- Responses never expose `pm2_env.env` or `filter_env`.

These allowlists stop accidental inheritance and casual abuse — they are **not** a hard boundary. A caller who can run an arbitrary script as the same OS user can read the agent's files directly. The boundary is `AUTH_TOKEN` plus OS-level isolation.

### Known limits

- **Same-user isolation:** children run as the service account. On Linux they can read `/proc/<pid>/environ`; on any OS `pm2 jlist` and `%USERPROFILE%\.pm2\dump.pm2` expose stored env values to the same user.
- **`dump.pm2` is plaintext:** the agent auto-saves after start/stop/delete and the dump stores each app's `env` values and `filter_env` key names. Restrict it to the service account, e.g. `icacls "%USERPROFILE%\.pm2" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"`.
- **Daemon environment:** fork children do not inherit the daemon's env (proven by `src/tests/integration/start-isolation.test.ts` against a daemon carrying an extra secret). The daemon itself still inherits the agent's env when the agent starts it, and daemon-side `PM2_NODE_OPTIONS` is appended to every fork child's interpreter args — keep it unset and run the daemon as the service account.
- **No IP allowlist:** add a firewall or reverse-proxy rule when the agent is reachable beyond localhost.

## Documentation

| File | What it covers |
|---|---|
| [SETUP.md](./docs/SETUP.md) | Install, configure, and run the service under PM2 |
| [ROUTES.md](./docs/ROUTES.md) | Full API reference — routes, envelopes, language recipes |
| [PM2 REFERENCE](./docs/PM2_payload_reference.md) | Every field accepted by `POST /pm2/start` |