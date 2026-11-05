# xpm-exporter

A small Prometheus exporter for PM2 process metrics. It runs next to `xpm-agent` on each server, as its own PM2 app (`xpm-exporter`) under Node, with its own `package.json`. Sources are TypeScript in `src/`, compiled to `dist/` with `npm run build`. It shares no code with the agent.

It only serves `GET /metrics`, makes no outbound calls, and exposes no process env, args or cwd. It also exposes whole-host CPU and memory utilization alongside the PM2 process metrics. Derived from [`pm2-metrics`](https://github.com/saikatharryc/pm2-prometheus-exporter).

Setup (install, environment, and running under PM2) is in **[docs/SETUP.md](./docs/SETUP.md)**.

## What it does

- Connects to the local PM2 daemon on every scrape.
- Rebuilds all series from the current process list, so processes that disappeared leave no stale series behind.
- Excludes the optional `pm2-logrotate` module, matching the agent API.
- Adds whole-host CPU and memory utilization gauges on every scrape.
- Serves one Prometheus text response with one series per process per PM2 metric, plus the host gauges.

## Response

| Request | Response |
|---|---|
| `GET /metrics` | `200` with `text/plain; version=0.0.4; charset=utf-8` |
| `GET /` | `200` with a small HTML page linking to `/metrics` |
| Any other method or path | `404` |
| PM2 unreachable or scrape timeout | `503` with a short plain-text message |

## Metrics

PM2 series have two labels: `name` (PM2 process name) and `namespace` (PM2 namespace, `default` if none). If two live processes share both, a `unique_id` label is added to those colliding series only. Host gauges have no exporter labels; the Prometheus scrape must add the server label (for example `app`) to match the PM2 series.

| Metric | Type | Meaning |
|---|---|---|
| `pm2_cpu` | gauge | CPU usage, percent |
| `pm2_memory` | gauge | Memory usage, bytes |
| `pm2_uptime` | gauge | Seconds since start while `online`, otherwise `0` |
| `pm2_start_time_seconds` | gauge | Start time as a Unix timestamp. Changes on every (re)start |
| `pm2_restarts_total` | counter | Total restarts |
| `pm2_unstable_restarts_total` | counter | Restarts that happened too soon after a start |
| `pm2_status` | gauge | Detailed status code (table below) |
| `host_cpu_usage_percent` | gauge | Whole-host CPU utilization, 0–100 |
| `host_cpu_cores` | gauge | Host logical CPU core count |
| `host_memory_usage_percent` | gauge | Whole-host memory utilization, 0–100 |
| `host_memory_total_bytes` | gauge | Host memory total, bytes |

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
# HELP host_cpu_usage_percent Host CPU utilization in percent (0 when unavailable)
# TYPE host_cpu_usage_percent gauge
host_cpu_usage_percent 34.2
# HELP host_cpu_cores Host logical CPU core count (0 when unavailable)
# TYPE host_cpu_cores gauge
host_cpu_cores 8
# HELP host_memory_usage_percent Host memory utilization in percent (0 when unavailable)
# TYPE host_memory_usage_percent gauge
host_memory_usage_percent 61.0
# HELP host_memory_total_bytes Host memory total in bytes (0 when unavailable)
# TYPE host_memory_total_bytes gauge
host_memory_total_bytes 17179869184
```
