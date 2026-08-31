# Setup

Install, configure, and run **xpm-agent** under PM2.

## 1. Copy the environment files

Copy the example into two files — one for the base config, one for production (single command, Command Prompt):

```cmd
copy .env.example .env & copy .env.example .env.production
```

## 2. Configure the server

Open `.env` and `.env.production` and set:

| Variable | Description | Example |
|---|---|---|
| `SERVER_PORT` | Port the API listens on | `4000` |
| `CORS_ORIGIN` | Comma-separated allowed browser origins (e.g. `http://localhost:3000,http://localhost:5173`). Omit or leave empty to **deny all browser origins** with 403 (`CORS_ORIGIN_NOT_ALLOWED`). Only non-browser clients (curl, Postman) are unaffected. | `http://localhost:3000,http://localhost:5173` |
| `AUTH_TOKEN` | Optional bearer token. When set, every `/pm2/*` request must include `Authorization: Bearer <AUTH_TOKEN>` or it is rejected with 401 (`UNAUTHORIZED`). Leave empty to disable auth. No database needed — this is a single shared secret. | `a-secret-string` |

**Which file wins?** `.env` is the base config, always loaded. When the service runs in production (`npm run start` → `--env production` → `NODE_ENV=production`), Bun also loads `.env.production` and its values **override** `.env`. So put generic defaults in `.env` and production-specific values (real `AUTH_TOKEN`, server port, CORS origins) in `.env.production`. Both files are gitignored.

> **Authentication (optional):** set `AUTH_TOKEN` when the agent runs on a network that isn't strictly localhost. CORS only blocks browsers — curl, scripts, and other servers bypass it entirely. The token gates those. When unset, all `/pm2/*` routes are open to any client that can reach the port.

## 3. Install dependencies

```bash
bun install
```

> `npm install` also works, but this project is Bun-first — `bun.lock` is the authoritative lockfile, so `bun install` is recommended.

## 4. Run the service (production)

```bash
npm run start
```

This is a shortcut for the underlying command:

```bash
bun run build && pm2 startOrReload ecosystem.config.js --env production && pm2 save
```

- `bun run build` — bundles `src/index.ts` into `dist/index.js` (Bun target, minified). Production runs the compiled bundle, not the TypeScript source.
- `pm2 startOrReload ecosystem.config.js --env production` — starts (or reloads) the API under PM2 with the `bun` interpreter from `ecosystem.config.js`. `--env production` applies the `env_production` block, setting `NODE_ENV=production`, which also makes Bun load `.env.production` on top of `.env` (see step 2). Fork mode, autorestart, max 10 restarts.
- `pm2 save` — persists the current process list so it is restored on reboot.

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
bun test           # unit tests (PM2 and the filesystem are mocked — no daemon needed)
bun run typecheck  # TypeScript type check
bun run build      # produce dist/index.js, as CI and `npm run start` do
```

Run `bun test`, `bun run typecheck`, and `bun run build` before deploying.

## 6. Auto-start on Windows boot (optional)

PM2 is restored automatically on reboot thanks to `pm2-windows-startup` (already a project dependency). Register it once:

```bash
bunx pm2-startup install
```

Only needed on Windows. After running, `pm2 save` (from step 4) ensures the process list is restored at boot.