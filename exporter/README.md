# xpm-exporter

A small Prometheus exporter for PM2 process metrics. It runs next to `xpm-agent` on each server, as its own PM2 app (`xpm-exporter`) under Node, with its own `package.json`. Sources are TypeScript in `src/`, compiled to `dist/` with `npm run build`. It shares no code with the agent.

It only serves `GET /metrics`, makes no outbound calls, and exposes no process env, args or cwd. Host CPU/RAM is not included (use `windows_exporter`). Derived from [`pm2-metrics`](https://github.com/saikatharryc/pm2-prometheus-exporter).

Setup (install, environment, and running under PM2) is in **[docs/SETUP.md](./docs/SETUP.md)**.

## What it does

- Connects to the local PM2 daemon on every scrape.
- Rebuilds all series from the current process list, so processes that disappeared leave no stale series behind.
- Serves one Prometheus text response with one series per process per metric.

## Response

| Request | Response |
|---|---|
| `GET /metrics` | `200` with `text/plain; version=0.0.4; charset=utf-8` |
| `GET /` | `200` with a small HTML page linking to `/metrics` |
| Any other method or path | `404` |
| PM2 unreachable or scrape timeout | `503` with a short plain-text message |

## Metrics

Every series has two labels: `name` (PM2 process name) and `namespace` (PM2 namespace, `default` if none). If two live processes share both, a `unique_id` label is added to those colliding series only.

| Metric | Type | Meaning |
|---|---|---|
| `pm2_cpu` | gauge | CPU usage, percent |
| `pm2_memory` | gauge | Memory usage, bytes |
| `pm2_uptime` | gauge | Seconds since start while `online`, otherwise `0` |
| `pm2_start_time_seconds` | gauge | Start time as a Unix timestamp. Changes on every (re)start |
| `pm2_restarts_total` | counter | Total restarts |
| `pm2_unstable_restarts_total` | counter | Restarts that happened too soon after a start |
| `pm2_status` | gauge | Detailed status code (table below) |

### Status codes

These values are shared with the web Dashboard and charts. Keep them in sync
with `web/src/lib/status-catalog.ts`.

| Code | Status |
|---|---|
| `0` | unknown / other |
| `1` | errored |
| `2` | failed (exit ≠ 0) |
| `3` | degraded |
| `4` | waiting restart |
| `5` | launching / stopping |
| `6` | stopped |
| `7` | scheduled (idle) |
| `8` | completed |
| `9` | online |

`one-launch-status` is grouped with `launching`/`stopping` as code `5`.

`stopped` is not always a problem (for example, a cron job that finished cleanly).

## Labels and uniqueness

Every series has two labels — `name` (PM2 process name) and `namespace` (PM2 namespace, `default` if none) — and is identified by `(metric, name, namespace)`. Restarting an app, or deleting and re-registering it with the same name, keeps the same series; Prometheus handles the counter resets.

If two live processes share the same `name` and `namespace`, a `unique_id` label is added to just those colliding series so the scrape stays valid. Same-named processes in different namespaces never collide.

HELP and TYPE are emitted once per metric.

## Access

The exporter listens on `EXPORTER_HOST:EXPORTER_PORT` from `.env` — both are required, and startup exits with code `2` when one is missing or `EXPORTER_PORT` is already in use by another process. The example configuration uses port `9209`:

<http://localhost:9209/metrics>

See [docs/SETUP.md](./docs/SETUP.md) for setup and troubleshooting.

### Sample response

One online process in the `XPM` namespace. Values and timestamps are examples; the real response contains one block like this per metric and one line per PM2 process.

```text
# HELP pm2_cpu PM2 process CPU usage in percent (0 when unknown)
# TYPE pm2_cpu gauge
pm2_cpu{name="xpm-agent",namespace="XPM"} 0.4
# HELP pm2_memory PM2 process memory usage in bytes (0 when unknown)
# TYPE pm2_memory gauge
pm2_memory{name="xpm-agent",namespace="XPM"} 73400320
# HELP pm2_restarts_total Total number of PM2 restarts (pm2_env.restart_time)
# TYPE pm2_restarts_total counter
pm2_restarts_total{name="xpm-agent",namespace="XPM"} 2
# HELP pm2_start_time_seconds Process start time as a Unix timestamp in seconds (pm2_env.pm_uptime / 1000; 0 when unknown)
# TYPE pm2_start_time_seconds gauge
pm2_start_time_seconds{name="xpm-agent",namespace="XPM"} 1792304400
# HELP pm2_status Detailed status code shared with the web UI (0 unknown, 1 errored, 2 failed, 3 degraded, 4 waiting restart, 5 launching/stopping, 6 stopped, 7 scheduled, 8 completed, 9 online)
# TYPE pm2_status gauge
pm2_status{name="xpm-agent",namespace="XPM"} 9
# HELP pm2_unstable_restarts_total Total number of PM2 unstable restarts (pm2_env.unstable_restarts)
# TYPE pm2_unstable_restarts_total counter
pm2_unstable_restarts_total{name="xpm-agent",namespace="XPM"} 0
# HELP pm2_uptime Seconds since the process started, when online; 0 otherwise
# TYPE pm2_uptime gauge
pm2_uptime{name="xpm-agent",namespace="XPM"} 3600
```
