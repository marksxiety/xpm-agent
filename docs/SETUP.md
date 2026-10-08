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

## 3. Configure the server

Open `.env` and `.env.production` and set:

| Variable | Description | Example |
|---|---|---|
| `SERVER_PORT` | **Required.** Port the API listens on. Startup fails with a clear command-line error when it is missing, not a whole number, outside 1–65535, or already in use by another process. | `4000` |
| `CORS_ORIGIN` | **Required for browser-facing deployments.** Comma-separated allowed browser origins (e.g. `http://localhost:3000,http://localhost:5173`). Omit or leave empty to **deny all browser origins** with 403 (`CORS_ORIGIN_NOT_ALLOWED`) — non-browser clients (curl, Postman, other services) are unaffected. | `http://localhost:3000,http://localhost:5173` |
| `AUTH_TOKEN` | **Required.** Bearer token for every `/pm2/*` request (`Authorization: Bearer <AUTH_TOKEN>`). The agent refuses to boot without it because `POST /pm2/start` executes code by design; generate one with e.g. `openssl rand -hex 32`. | `a-secret-string` |
| `ALLOW_INSECURE` | Local-development escape hatch. Set to `true` to boot without `AUTH_TOKEN`; the agent logs an insecure-mode warning on every start. Never enable on a reachable host. | `true` |
| `APP_ROOTS` | Optional comma-separated allowlist of absolute app roots. When set, `cwd` on `/start` must live under one of them, otherwise the request is rejected with 422. | `C:\apps,/srv/apps` |

**Which file wins?** `.env` is the base config, always loaded. When the service runs in production (`npm run start` → `--env production` → `NODE_ENV=production`), Bun also loads `.env.production` and its values **override** `.env`. So put generic defaults in `.env` and production-specific values (real `AUTH_TOKEN`, server port, CORS origins) in `.env.production`. Both files are gitignored.

> **Authentication (required):** set `AUTH_TOKEN` whenever the agent runs — it will not start otherwise. CORS only blocks browsers — curl, scripts, and other servers bypass it entirely. The token is the only access control, so pair it with OS-level isolation when the port is reachable beyond localhost.

## 4. Run the service (production)

```bash
npm run start
```

This is a shortcut for the underlying command:

```bash
bun --env-file=.env --env-file=.env.production src/check-port.ts && bun run build && pm2 startOrReload ecosystem.config.js --env production && pm2 save
```

- `bun --env-file=... src/check-port.ts` — preflight that resolves `SERVER_PORT` from the same env files the app uses and fails fast with a clear command-line error when the port is missing, invalid, or already in use. It inspects the OS TCP listener table (`netstat -ano`), so listeners on any interface or address family are detected and reported with their PID and process name. It skips the free-port check when `xpm-agent` is already online under PM2 (the reload path).
- `bun run build` — bundles `src/index.ts` into `dist/index.js` (Bun target, minified). Production runs the compiled bundle, not the TypeScript source.
- `pm2 startOrReload ecosystem.config.js --env production` — starts (or reloads) the API under PM2 with the `bun` interpreter from `ecosystem.config.js`. `--env production` applies the `env_production` block, setting `NODE_ENV=production`, which also makes Bun load `.env.production` on top of `.env` (see step 3). Fork mode, autorestart with `min_uptime: "10s"`, 100ms exponential backoff (PM2 caps it at 15s), effectively unlimited restarts (`max_restarts: 999999`), and `max_memory_restart: "250M"`.
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

## 5. Development

Production runs the compiled `dist/` bundle. During development, run the TypeScript source directly with hot reload instead:

```bash
bun run dev        # hot reload, no build, no PM2
bun test           # unit tests + the start-isolation canary (spawns an isolated PM2 daemon)
bun run typecheck  # TypeScript type check
bun run build      # produce dist/index.js, as CI and `npm run start` do
```

Run `bun test`, `bun run typecheck`, and `bun run build` before deploying.

## 6. Auto-start on boot (optional)

PM2 is restored automatically on reboot thanks to `pm2-windows-startup` (already a project dependency). Register it once:

```bash
bunx pm2-startup install
```

The installer writes an `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry that runs `pm2 resurrect` at user logon (with the logon user's environment), so keep the service account logged in or use a service manager for headless hosts.

After running, `pm2 save` (from step 4) ensures the process list is restored at boot.

## 7. Security notes

- `POST /pm2/start` is remote code execution by design: the child runs as the service account. `AUTH_TOKEN` is mandatory (boot fails without it) and should be paired with OS-level isolation when the port is reachable beyond localhost.
- The agent pins `pm2` to an exact version (`package.json`) and ships a lockfile; PM2 internals (`filter_env`, `prepareAppConf`, `executeApp`, fork/cluster env handling) are security-relevant, so re-run `bun test` before bumping.
- `%USERPROFILE%\.pm2\dump.pm2` stores each app's `env` in plaintext. Restrict it to the service account, e.g.:

  ```cmd
  icacls "%USERPROFILE%\.pm2" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"
  ```

- Keep `PM2_NODE_OPTIONS` unset: PM2 appends it to every fork child's interpreter args. Fork children do not otherwise inherit the daemon's env — `src/tests/integration/start-isolation.test.ts` proves it with a canary secret.
- See the README's [Security model](../README.md#security-model) for the full allowlist/threat-model description.