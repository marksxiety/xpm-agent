# Setup

Install, configure, and run **x-process-manager-api** under PM2.

## 1. Copy the environment file

```bash
cp .env.example .env
```

Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

## 2. Configure the server

Open `.env` and set:

| Variable | Description | Example |
|---|---|---|
| `SERVER_PORT` | Port the API listens on | `4000` |
| `CORS_ORIGIN` | Comma-separated allowed browser origins (e.g. `http://localhost:3000,http://localhost:5173`). Omit or leave empty to **deny all browser origins** with 403 (`CORS_ORIGIN_NOT_ALLOWED`). Only non-browser clients (curl, Postman) are unaffected. | `http://localhost:3000,http://localhost:5173` |

## 3. Install dependencies

```bash
bun install
```

> `npm install` also works, but this project is Bun-first — `bun.lock` is the authoritative lockfile, so `bun install` is recommended.

## 4. Run the service

```bash
npm run start
```

This is a shortcut for the underlying command:

```bash
pm2 startOrReload ecosystem.config.js && pm2 save
```

- `startOrReload` — starts the API under PM2 (fork mode, autorestart) from `ecosystem.config.js`, or reloads it if already running.
- `pm2 save` — persists the current process list so it is restored on reboot.

Verify it is running:

```bash
pm2 list
```

You should see `x-process-manager-api` with status `online`. Then hit the health check:

```bash
curl http://localhost:4000/pm2/health
```

Interactive docs: <http://localhost:4000/swagger>

## 5. Development (optional)

`npm run start` runs the service under PM2 — use it when running the API. During development, use watch mode instead:

```bash
bun run dev        # hot reload, no PM2
bun test           # unit tests (PM2 and the filesystem are mocked — no daemon needed)
bun run typecheck  # TypeScript type check
```

Run `bun test` and `bun run typecheck` before deploying.

## 6. Auto-start on Windows boot (optional)

PM2 is restored automatically on reboot thanks to `pm2-windows-startup` (already a project dependency). Register it once:

```bash
bunx pm2-startup install
```

Only needed on Windows. After running, `pm2 save` (from step 4) ensures the process list is restored at boot.