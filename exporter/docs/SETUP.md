# Setup

Install, configure, and run **xpm-exporter** under PM2.

The exporter runs next to `xpm-agent`, but as its own PM2 app (`xpm-exporter`) under Node and with its own `package.json`. It shares no code with the agent.

## Prerequisites

- **Node.js 20.12 or newer** — the exporter uses `process.loadEnvFile` to read its `.env`.
- **PM2** — the exporter is designed to run as a long-lived PM2 app.

## 1. Install dependencies

```bash
cd exporter
npm install
```

## 2. Configure the environment

Copy the example file and edit the values:

```cmd
copy .env.example .env
```

```bash
cp .env.example .env
```

`exporter.js` loads `.env` from the exporter directory at startup, so each server can keep its own settings. The file is gitignored; shell environment variables take precedence over it.

There are no defaults: all three variables are required. A missing or invalid value makes the exporter exit with code `2` and log a clear message.

| Variable | Example | Purpose |
|---|---|---|
| `EXPORTER_PORT` | `9209` | Port to listen on. Before binding, the exporter checks the Windows listener table (`netstat -ano`); if the port is already taken it logs the owning PID/process and exits with code `2` |
| `EXPORTER_HOST` | `0.0.0.0` | Address to bind to. Use `127.0.0.1` when only local clients need access |
| `EXPORTER_TIMEOUT_MS` | `5000` | How long a scrape waits for PM2 before returning `503` |

## 3. Run the service via PM2

```bash
pm2 start ecosystem.config.js
pm2 save
```

Check that `xpm-exporter` is `online`:

```bash
pm2 list
```

Verify the endpoint:

```bash
curl http://localhost:9209/metrics
```

Open <http://localhost:9209/metrics> in a browser if you changed `EXPORTER_HOST` or `EXPORTER_PORT`, adjust the address accordingly.

If you already ran `bunx pm2-startup install` for the agent, `pm2 save` also persists `xpm-exporter` for reboot.

> The repository-root `ecosystem.config.js` also starts this app by composing this file (`...require("./exporter/ecosystem.config.js").apps`), so a root `npm run start` starts `xpm-exporter` too. Running it standalone as above remains supported — PM2 matches apps by name and namespace, so the two entry points never create duplicates.

## 4. Update the configuration

Edit `.env`, then restart the app so it re-reads the file:

```bash
pm2 restart xpm-exporter
```

## Troubleshooting

- **`503` on `/metrics`** — PM2's daemon is unreachable or did not answer within `EXPORTER_TIMEOUT_MS`. Check `pm2 list` and `pm2 logs xpm-exporter`.
- **`port <n> is already in use by PID <pid> (<name>)`** — the startup check found a listener on `EXPORTER_PORT`. Stop that process or pick another port, then `pm2 restart xpm-exporter`.
- **`EADDRINUSE` / bind error** — fallback when the OS listener table is unavailable (non-Windows, or a race after the check): another process owns `EXPORTER_PORT`; change it in `.env` and restart.
- **Missing or invalid `EXPORTER_*` value** — the exporter exits with code `2`; the log line names the variable and the expected format, and `stop_exit_codes: [2]` keeps PM2 from retrying.
- **`.env` ignored when PM2 starts** — confirm the file is `exporter/.env` (next to `exporter.js`), not the repository root.
