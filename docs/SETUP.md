# Setup

Install, configure, and run **xpm-agent** under PM2.

> **Platform support: Windows only.** Setup, PM2 integration, and boot-startup are supported on Windows only — Linux/macOS are not supported yet.

## 1. Install dependencies

```bash
bun install
```

> `npm install` also works, but this project is Bun-first — `bun.lock` is the authoritative lockfile, so `bun install` is recommended.

Then install PM2 globally so the `pm2` CLI is available for manual commands and boot registration:

```bash
bun install -g pm2
```

> PM2 stays a project dependency too — `npm run start` invokes the local binary. The global install only puts `pm2` and `bunx pm2` on your `PATH`.

## 2. Copy the environment files

Copy the example into two files — one for the base config, one for production (single command, Command Prompt):

```cmd
copy .env.example .env & copy .env.example .env.production
```

## 3. Enable log rotation (one-time)

PM2 never rotates logs on its own, so a long-running fleet fills `~/.pm2/logs` until the disk does. Install PM2's official rotation module once per host:

```bash
bun run setup:logrotate
```

This is a shortcut for:

```bash
pm2 install pm2-logrotate@2.7.0 && pm2 set pm2-logrotate:max_size 10M && pm2 set pm2-logrotate:retain 30 && pm2 set pm2-logrotate:compress true && pm2 save
```

- `pm2 install` (not `npm install`) registers `pm2-logrotate` as a **PM2 module**, not an app dependency — it is not in `package.json` and is version-pinned to `2.7.0`.
- `max_size 10M` — rotate a file once it grows past 10 MB.
- `retain 30` — keep the last 30 rotated files per stream.
- `compress true` — gzip rotated files (`.log.gz`).
- `pm2 save` persists the module so it survives a reboot alongside the agent.

Rotated files are named `namespace-app-out__YYYY-MM-DD_HH-mm-ss.log` (or `.log.gz`) and are reported by the API: `GET /pm2/logs/:id` returns a `size` object per stream, and `GET /pm2/system` (and `GET /pm2/list?overview=true`) returns the total size and file count of every log file. Inspect the live config with `pm2 conf pm2-logrotate`.

> `pm2-logrotate` is optional. Without it the agent still reports current-file sizes; the `logs` overview will simply stay near one file per stream.

## 4. Configure the server

Open `.env` and `.env.production` and set:

| Variable | Description | Example |
|---|---|---|
| `SERVER_PORT` | **Required.** Port the API listens on. Startup fails with a clear command-line error when it is missing, not a whole number, outside 1–65535, or already in use by another process. | `4000` |
| `CORS_ORIGIN` | **Required for browser-facing deployments.** Comma-separated allowed browser origins (e.g. `http://localhost:3000,http://localhost:5173`). Omit or leave empty to **deny all browser origins** with 403 (`CORS_ORIGIN_NOT_ALLOWED`) — non-browser clients (curl, Postman, other services) are unaffected. | `http://localhost:3000,http://localhost:5173` |
| `AUTH_TOKEN` | Optional bearer token. When set, every `/pm2/*` request must include `Authorization: Bearer <AUTH_TOKEN>` or it is rejected with 401 (`UNAUTHORIZED`). Leave empty to disable auth (fine for a strictly local/internal tool). | `a-secret-string` |
| `APP_ROOTS` | Optional comma-separated allowlist of absolute app roots. When set, `cwd` on `/start` must live under one of them, otherwise the request is rejected with 422. | `C:\apps,/srv/apps` |
| `INTERPRETER_ROOTS` | Optional comma-separated allowlist of absolute directories. When set, the `interpreter` executable on `/start` must live under one of them, otherwise the request is rejected with 422. Hardens against a renamed binary elsewhere on disk. | `C:\Program Files\nodejs,/usr/bin` |
| `INTERPRETER_FLAGS` | Optional JSON allowlist of interpreter flags, keyed by the interpreter executable's base name (without `.exe`). `/start` rejects any `interpreter_args` for an interpreter not listed here. Each rule is `{"kind":"exact","flag":"-u"}`, `{"kind":"pattern","pattern":"^--max-old-space-size=\\d+$"}`, or `{"kind":"path","flag":"--env-file"}` (value must resolve inside `cwd`). Malformed JSON/regex fails startup. | `{"node":[{"kind":"path","flag":"--env-file"}],"python":[{"kind":"exact","flag":"-u"}]}` |

**Which file wins?** `.env` is the base config, always loaded. When the service runs in production (`npm run start` → `--env production` → `NODE_ENV=production`), Bun also loads `.env.production` and its values **override** `.env`. So put generic defaults in `.env` and production-specific values (real `AUTH_TOKEN`, server port, CORS origins) in `.env.production`. Both files are gitignored.

> **Authentication (optional):** set `AUTH_TOKEN` whenever the agent runs on a network that isn't strictly localhost. CORS only blocks browsers — curl, scripts, and other servers bypass it entirely. The token is the only access control, so pair it with OS-level isolation when the port is reachable beyond localhost.

## 5. Run the service (production)

```bash
npm run start
```

This is a shortcut for the underlying command:

```bash
bun --env-file=.env --env-file=.env.production src/check-port.ts && bun run build && pm2 startOrReload ecosystem.config.js --env production && pm2 save
```

- `bun --env-file=... src/check-port.ts` — preflight that resolves `SERVER_PORT` from the same env files the app uses and fails fast with a clear command-line error when the port is missing, invalid, or already in use. It inspects the OS TCP listener table (`netstat -ano`), so listeners on any interface or address family are detected and reported with their PID and process name. It skips the free-port check when `xpm-agent` is already online under PM2 (the reload path).
- `bun run build` — bundles `src/index.ts` into `dist/index.js` (Bun target, minified). Production runs the compiled bundle, not the TypeScript source.
- `pm2 startOrReload ecosystem.config.js --env production` — starts (or reloads) the API under PM2 with the `bun` interpreter from `ecosystem.config.js`. `--env production` applies the `env_production` block, setting `NODE_ENV=production`, which also makes Bun load `.env.production` on top of `.env` (see step 4). Fork mode, autorestart with `min_uptime: "10s"`, 100ms exponential backoff (PM2 caps it at 15s), effectively unlimited restarts (`max_restarts: 999999`), and `max_memory_restart: "250M"`.
- `pm2 save` — persists the current process list so it is restored on reboot.

At startup the API checks the OS listener table for `SERVER_PORT` before binding — on Windows this is the only reliable guard, because Bun can still bind over a listener that does not set `SO_EXCLUSIVEADDRUSE`, even with port sharing disabled. Startup and configuration failures exit with code 2, which `stop_exit_codes` in `ecosystem.config.js` tells PM2 not to retry; check the message in the terminal or in `pm2 logs xpm-agent`.

**Deploying an update:** just re-run `npm run start` — it rebuilds `dist/` and reloads the process in one step.

Verify it is running:

```bash
pm2 list
```

You should see `xpm-agent` with status `online`. Then hit the health check:

```bash
curl http://localhost:4000/pm2/health
```

Interactive docs: <http://localhost:4000/swagger>

## 6. Development

Production runs the compiled `dist/` bundle. During development, run the TypeScript source directly with hot reload instead:

```bash
bun run dev        # hot reload, no build, no PM2
bun test           # unit tests + the start-isolation canary (spawns an isolated PM2 daemon)
bun run typecheck  # TypeScript type check
bun run build      # produce dist/index.js, as CI and `npm run start` do
```

Run `bun test`, `bun run typecheck`, and `bun run build` before deploying.

## 7. Auto-start on boot (optional)

PM2 is restored automatically on reboot thanks to `pm2-windows-startup` (already a project dependency). Register it once:

```bash
bunx pm2-startup install
```

The installer writes an `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry that runs `pm2 resurrect` at user logon (with the logon user's environment), so keep the service account logged in or use a service manager for headless hosts.

After running, `pm2 save` (from step 5) ensures the process list is restored at boot.

## 8. Prometheus exporter (optional)

`exporter/` contains `xpm-exporter`, a standalone Prometheus exporter for PM2 process metrics. It runs as a separate PM2 app under Node and shares no code with the agent; host CPU/RAM is not included.

Requirements: Node.js 20.12 or newer and PM2. The exporter has its own dependencies, `.env`, and PM2 ecosystem file, so install and run it from its directory:

```cmd
cd exporter
npm install
copy .env.example .env
pm2 start ecosystem.config.js
pm2 save
```

It serves metrics at <http://localhost:9209/metrics> by default. See [exporter/docs/SETUP.md](../exporter/docs/SETUP.md) for the full install, environment, and PM2 guide, and [exporter/README.md](../exporter/README.md) for the metrics and response contract.

## 9. Security notes

- `POST /pm2/start` is remote code execution by design: the child runs as the service account. Set `AUTH_TOKEN` and pair it with OS-level isolation when the port is reachable beyond localhost.
- The agent pins `pm2` to an exact version (`package.json`) and ships a lockfile; PM2 internals (`filter_env`, `prepareAppConf`, `executeApp`, fork/cluster env handling) are security-relevant, so re-run `bun test` before bumping.
- `%USERPROFILE%\.pm2\dump.pm2` stores each app's `env` in plaintext. Restrict it to the service account, e.g.:

  ```cmd
  icacls "%USERPROFILE%\.pm2" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"
  ```

- Keep `PM2_NODE_OPTIONS` unset: PM2 appends it to every fork child's interpreter args. Fork children do not otherwise inherit the daemon's env — `src/tests/integration/start-isolation.test.ts` proves it with a canary secret.
- See [SECURITY.md](./SECURITY.md) for the full allowlist and threat model.