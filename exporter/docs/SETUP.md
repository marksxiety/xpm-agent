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

| Variable | Default | Purpose |
|---|---|---|
| `EXPORTER_PORT` | `9209` | Port to listen on |
| `EXPORTER_HOST` | `0.0.0.0` | Address to bind to. Use `127.0.0.1` when only local clients need access |
| `EXPORTER_TIMEOUT_MS` | `5000` | How long a scrape waits for PM2 before returning `503` |

Invalid values make the exporter exit with code `2` and a clear message in the PM2 logs.

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

## 4. Update the configuration

Edit `.env`, then restart the app so it re-reads the file:

```bash
pm2 restart xpm-exporter
```

## Troubleshooting

- **`503` on `/metrics`** — PM2's daemon is unreachable or did not answer within `EXPORTER_TIMEOUT_MS`. Check `pm2 list` and `pm2 logs xpm-exporter`.
- **`EADDRINUSE` / bind error** — another process, often a second exporter, already owns `EXPORTER_PORT`; change it in `.env` and restart.
- **Invalid `EXPORTER_*` value** — the exporter exits with code `2`; the log line names the variable and the expected format.
- **`.env` ignored when PM2 starts** — confirm the file is `exporter/.env` (next to `exporter.js`), not the repository root.
