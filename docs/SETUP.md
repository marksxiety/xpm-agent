# Setup

Install, configure, and run **xpm-agent** under PM2.

> **Platform support: Windows only.** Run every command in PowerShell.

## 1. Install Node.js (npm included)

The bundled Prometheus exporter runs on Node and requires **Node 20.12 or newer**.

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Close and reopen PowerShell, then verify:

```powershell
node -v
npm -v
```

> If `winget` is unavailable, install the LTS MSI from <https://nodejs.org> and reopen PowerShell.

## 2. Install Bun 1.3.14

```powershell
powershell -c "iex \"& {$(irm https://bun.sh/install.ps1)} -Version 1.3.14\""
```

Close and reopen PowerShell, then verify:

```powershell
bun -v
```

You should see `1.3.14`.

## 3. Install PM2 globally

```powershell
bun install -g pm2@7.1.1
pm2 -v
```

`7.1.1` matches the PM2 badge in [README.md](../README.md) and the pinned dependency in `package.json`. The local project dependency is used by `npm run start`; the global install puts `pm2` and `bunx pm2` on your `PATH` for manual commands and boot registration.

## 4. Install agent and exporter dependencies

```powershell
npm run install
```

This runs `bun install` for the agent and `npm install` inside `exporter/`.

### Log rotation (one-time, optional)

PM2 never rotates logs on its own, so a long-running fleet fills `~/.pm2/logs`. The optional official `pm2-logrotate` module keeps it bounded. Install it once per host:

```powershell
npm run setup:logrotate
```

This is a shortcut for:

```powershell
pm2 install pm2-logrotate@2.7.0
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 save
```

- `pm2 install` registers a **PM2 module**, not an app in `ecosystem.config.js` and not part of the `XPM` namespace.
- It rotates **every** PM2 app in every namespace (plus `pm2.log`/`agent.log`); it cannot be limited to `XPM`.
- `max_size 10M` rotates once a stream passes 10 MB, `retain 30` keeps the last 30 archives per stream, and `compress true` writes `.log.gz` files.
- `pm2 save` persists the module across reboots.
- The agent hides `pm2-logrotate` from `GET /pm2/list`; `/pm2/describe`, `/pm2/logs`, `/pm2/flush`, and lifecycle routes return `404` for it, and `/pm2/start` rejects the name.

Inspect the live config with `pm2 conf pm2-logrotate`. Rotated files are named `<stem>__YYYY-MM-DD_HH-mm-ss.log[.gz]`, which is the naming the agent already reports and deletes.

## 5. Configure the environment

`npm run start` creates these files automatically when they are missing, so you can start first and edit afterward. To edit before the first start, run:

```powershell
npm run setup:env
```

Creates, only when missing:

- `.env` in the repository root
- `exporter/.env`

Existing files are never overwritten.

### Root `.env`

| Variable | Description | Example |
|---|---|---|
| `SERVER_PORT` | **Required.** Port the API listens on. Startup fails with a clear command-line error when it is missing, not a whole number, outside 1–65535, or already in use by another process. | `4000` |
| `CORS_ORIGIN` | **Required for browser-facing deployments.** Comma-separated allowed browser origins. Omit or leave empty to deny all browser origins with 403 (`CORS_ORIGIN_NOT_ALLOWED`) — non-browser clients are unaffected. | `http://localhost:3000,http://localhost:5173` |
| `AUTH_TOKEN` | Optional bearer token. When set, every `/pm2/*` request must include `Authorization: Bearer <AUTH_TOKEN>` or it is rejected with 401 (`UNAUTHORIZED`). Leave empty only for a strictly local tool. | `a-secret-string` |
| `APP_ROOTS` | Optional comma-separated allowlist of absolute app roots. When set, `cwd` on `/start` must live under one of them. | `C:\apps,/srv/apps` |
| `INTERPRETER_ROOTS` | Optional comma-separated allowlist of absolute directories. When set, the `interpreter` on `/start` must live under one of them. | `C:\Program Files\nodejs,/usr/bin` |
| `INTERPRETER_FLAGS` | Optional JSON allowlist of interpreter flags, keyed by the interpreter executable's base name (without `.exe`). `/start` rejects any `interpreter_args` for an interpreter not listed here. Rules: `{"kind":"exact","flag":"-u"}`, `{"kind":"pattern","pattern":"^--max-old-space-size=\\d+$"}`, or `{"kind":"path","flag":"--env-file"}` (value must resolve inside `cwd`). Malformed JSON/regex fails startup. | `{"node":[{"kind":"path","flag":"--env-file"}],"python":[{"kind":"exact","flag":"-u"}]}` |

**`.env.production` is optional.** `npm run setup:env` does not create it. If you create it, the agent loads it on top of `.env` when running in production (`NODE_ENV=production`), so production-only values override the base file. Keep `SERVER_PORT` in `.env` so the startup port preflight can see it.

> **Authentication (optional):** set `AUTH_TOKEN` whenever the agent runs on a network that isn't strictly localhost. CORS only blocks browsers — curl, scripts, and other servers bypass it entirely. The token is the only access control, so pair it with OS-level isolation when the port is reachable beyond localhost.

### `exporter/.env`

| Variable | Example | Purpose |
|---|---|---|
| `EXPORTER_PORT` | `9209` | Port to listen on. The exporter checks the Windows listener table before binding; a busy port exits with code `2` and names the owning PID/process. |
| `EXPORTER_HOST` | `0.0.0.0` | Address to bind to. Use `127.0.0.1` when only local clients need access. |
| `EXPORTER_TIMEOUT_MS` | `5000` | How long a scrape waits for PM2 before returning `503`. |

All three are required (no defaults). The exporter reads the file once at startup, so run `pm2 restart xpm-exporter` after editing it.

## 6. Prometheus exporter (bundled)

`exporter/` contains `xpm-exporter`, a standalone Prometheus exporter for PM2 process and whole-host CPU/memory metrics. It runs as its own PM2 app under Node, with its own `package.json` and `.env`, and shares no code with the agent.

The repository-root `ecosystem.config.js` composes `exporter/ecosystem.config.js`, so `npm run start` builds and starts `xpm-exporter` together with the agent. `npm run install` installs its dependencies and `npm run build` compiles it; you do not need to run anything from `exporter/` manually.

`exporter/.env` is required (see step 5). To run the exporter independently, start it from its directory with `pm2 start ecosystem.config.js` — PM2 matches apps by name and namespace, so this never duplicates the root-managed app. See [exporter/docs/SETUP.md](../exporter/docs/SETUP.md) for the standalone guide.

## 7. Build and start

```powershell
npm run build
npm run start
```

`npm run build` builds the agent (`dist/index.js`) and the exporter (`exporter/dist/`).

`npm run start` is the single happy path. It always:

1. registers boot startup with `bunx pm2-startup install`;
2. creates `.env` and `exporter/.env` from their examples if missing;
3. runs the `SERVER_PORT` preflight;
4. builds both packages;
5. starts/reloads `xpm-agent` and `xpm-exporter` in the `XPM` namespace;
6. runs `pm2 save`.

The boot-startup entry is written to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` and runs `pm2 resurrect` at user logon, so keep the service account logged in or use a service manager for headless hosts.

Verify:

```powershell
pm2 list
curl http://localhost:4000/pm2/health
curl http://localhost:9209/metrics
```

You should see both apps under `XPM`:

| App | Interpreter | Purpose |
|---|---|---|
| `xpm-agent` | Bun | The HTTP API |
| `xpm-exporter` | Node | Prometheus metrics at `/metrics` |

`pm2-logrotate` is not in this table: it is a host-level PM2 module installed once in step 4, not an XPM app started by `npm run start`.

Interactive docs: <http://localhost:4000/swagger>

## 8. Development

Production runs the compiled `dist/` bundle. During development, run the TypeScript source directly with hot reload instead:

```powershell
bun run dev        # hot reload, no build, no PM2
bun test           # unit tests + the start-isolation canary (spawns an isolated PM2 daemon)
bun run typecheck  # TypeScript type check
bun run build      # build agent + exporter, as CI and npm run start do
```

Run `bun test`, `bun run typecheck`, and `bun run build` before deploying.

## 9. Security notes

- `POST /pm2/start` is remote code execution by design: the child runs as the service account. Set `AUTH_TOKEN` and pair it with OS-level isolation when the port is reachable beyond localhost.
- The agent pins `pm2` to an exact version (`package.json`) and ships a lockfile; PM2 internals (`filter_env`, `prepareAppConf`, `executeApp`, fork/cluster env handling) are security-relevant, so re-run `bun test` before bumping.
- `%USERPROFILE%\.pm2\dump.pm2` stores each app's `env` in plaintext. Restrict it to the service account, e.g.:

  ```powershell
  icacls "%USERPROFILE%\.pm2" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"
  ```

- Keep `PM2_NODE_OPTIONS` unset: PM2 appends it to every fork child's interpreter args. Fork children do not otherwise inherit the daemon's env — `src/tests/integration/start-isolation.test.ts` proves it with a canary secret.
- See [SECURITY.md](./SECURITY.md) for the full allowlist and threat model.
