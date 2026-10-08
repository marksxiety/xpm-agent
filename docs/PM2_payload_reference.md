# PM2 Payload Reference

Reference for a PM2 ecosystem-style process payload. **`script`, `cwd`, and `interpreter` are required**; every other field falls back to PM2 defaults, and unknown keys are rejected with `422`.

> **Sanitized before dispatch (`POST /pm2/start`).** Empty/whitespace `namespace` becomes `default`; `cwd` must be absolute, free of `..` segments, and never the agent's own directory; `max_restarts: 0` becomes `autorestart: false`; `exec_mode` is always `fork` with `instances: 1` (cluster mode is rejected because cluster workers inherit the daemon's environment); reserved PM2 keys and runtime loader options (`NODE_OPTIONS`, `BUN_OPTIONS`, `NODE_PATH`, `PYTHONSTARTUP`/`PYTHONPATH`, `PHPRC`, `PHP_INI_SCAN_DIR`, `LD_PRELOAD`) are rejected from `env` with `422`; the agent's own environment is never inherited, so only the explicit `env` pairs reach the child.

## Identity & script

Identifies the process and defines how its entry script is invoked: the file path, display name, working directory, arguments, and interpreter.

- `script` — **required** — entry file to run; must resolve inside `cwd`.
- `name` — process name shown in `pm2 list`; must match `^[A-Za-z0-9._-]{1,64}$`.
- `cwd` — **required** — working directory for the process. **Must be an absolute path** matching `targetOs`, without `..` segments, not the agent's own directory, and inside `APP_ROOTS` when that allowlist is configured.
- `args` — arguments passed to the script (array or string).
- `interpreter` — **this API requires an absolute path to the interpreter executable** (e.g. `C:\Program Files\nodejs\node.exe`) or `"none"` — bare names like `"node"`/`"python3"` are rejected by `/start`, and the executable must be a recognized runtime (`node`, `bun`, `php`, `python`, `go`). `"none"` additionally requires `AUTH_TOKEN` to be configured.
- `interpreter_args` — arguments passed to the interpreter itself. Allowlisted per runtime: `--max-old-space-size=<n>` and `--env-file` pointing inside `cwd` (Node/Bun), `-O/-OO/-u/-B` (Python); anything else (`--require`, `-e`, `-c`, …) is rejected.
- `namespace` — logical grouping (`pm2 list` can show/filter by this); must match `^[A-Za-z0-9._-]{1,64}$`. Empty/whitespace falls back to `default`.

```json
{
  "script": "./app/server.js",
  "name": "example-app",
  "cwd": "C:\\Example\\Application",
  "args": ["--port", "4000"],
  "interpreter": "C:\\Program Files\\nodejs\\node.exe",
  "interpreter_args": ["--max-old-space-size=256"],
  "namespace": "example"
}
```

## Process behavior

Controls how the process runs: execution mode, instance count, auto-restart on crash, and file watching for hot reloads.

- `exec_mode` — only `"fork"` is accepted. `"cluster"` is rejected with `422`: PM2 cluster workers fork from the daemon and would inherit the daemon's environment instead of the payload env.
- `instances` — only `1` is accepted; `"max"`, `-1`, and any other count are rejected with `422`.
- `autorestart` — restart automatically on crash/exit.
- `watch` — `true`, or an array of paths to watch for changes.
- `ignore_watch` — paths excluded from watch.
- `watch_delay` — ms debounce before restart-on-change.
- `windowsHide` — suppress spawned console window (Windows).

```json
{
  "exec_mode": "fork",
  "instances": 1,
  "autorestart": true,
  "watch": false,
  "ignore_watch": ["node_modules", "temp", "*.log"],
  "watch_delay": 500,
  "windowsHide": true
}
```

## Restart / crash handling

Tuning for how PM2 retries and restarts a failing process: backoff, stability threshold, memory caps, and graceful shutdown behavior.

- `max_restarts` — stop retrying after N unstable restarts. `0` is normalized to `autorestart: false` (`/start` rejects PM2's zero-limit errored-state behavior).
- `min_uptime` — min time running before considered "stable".
- `restart_delay` — ms delay between automatic restarts.
- `exp_backoff_restart_delay` — ms exponential backoff base for restart delay.
- `max_memory_restart` — restart if RSS exceeds this (K/M/G).
- `kill_timeout` — ms to wait for graceful shutdown before SIGKILL.
- `listen_timeout` — ms to wait for a "ready" signal before considered online.
- `shutdown_with_message` — use `process.send('shutdown')` instead of a signal.
- `wait_ready` — wait for `process.send('ready')` before marking online.
- `stop_exit_codes` — exit codes that should NOT trigger autorestart.
- `kill_retry_time` — ms between retries when killing a process.

```json
{
  "max_restarts": 10,
  "min_uptime": "5s",
  "restart_delay": 2000,
  "exp_backoff_restart_delay": 200,
  "max_memory_restart": "256M",
  "kill_timeout": 1000,
  "listen_timeout": 5000,
  "shutdown_with_message": false,
  "wait_ready": false,
  "stop_exit_codes": [0],
  "kill_retry_time": 200
}
```

## Environment

Environment variables injected into the process — default values plus named profiles merged in when using `--env <name>`.

> **Isolation on `/start`:** only the explicit `env` pairs are sent. The agent's own environment (`AUTH_TOKEN`, `SERVER_PORT`, `CORS_ORIGIN`, `PM2_*`/`pm_*` internals) is filtered out before the child is spawned, and reserved PM2 keys (`pm_id`, `name`, `namespace`, `exec_mode`, `NODE_APP_INSTANCE`, `pm_*`, `PM2_*`, `axm_*`, …) are stripped from `env`. The canonical `namespace` is added back automatically. PM2 still injects its own `PM2_HOME` and per-process metadata into every child.

- `env` — default env vars.
- `env_production` — extra env, merged in when using `--env production`.
- `env_development` — extra env, merged in when using `--env development`.

```json
{
  "env": {
    "NODE_ENV": "production",
    "PORT": "4000"
  },
  "env_production": {
    "NODE_ENV": "production"
  },
  "env_development": {
    "NODE_ENV": "development"
  }
}
```

## Logging

Where stdout/stderr and combined output are written, how they are formatted, and whether log writing is disabled.

- `output` — stdout log path (also `out_file`).
- `error` — stderr log path (also `error_file`).
- `log_file` — combined out+error log.
- `pid_file` — custom pid file path.
- `merge_logs` — merge logs from all cluster instances into one file.
- `log_date_format` — timestamp format prefixed to log lines.
- `time` — prefix logs with timestamp (shorthand for the above).
- `combine_logs` — don't suffix log filenames with process id.
- `disable_logs` — completely disable log writing.

```json
{
  "output": "./logs/example-out.log",
  "error": "./logs/example-error.log",
  "log_file": "./logs/example-combined.log",
  "pid_file": "./pids/example.pid",
  "merge_logs": true,
  "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
  "time": true,
  "combine_logs": true,
  "disable_logs": false
}
```

## Advanced / niche

Less common settings for special cases: V8 flags, scheduled restarts, git versioning, deploy hooks, and cluster-specific env manipulation.

- `node_args` — V8/Node flags (alternative to `interpreter_args` for node). PM2 supports it, but this API's `/start` schema rejects it — use `interpreter_args` instead.
- `cron_restart` — cron pattern to force periodic restart.
- `vizion` — disable git metadata versioning.
- `post_update` — commands run after a `pm2 pull`/deploy update. PM2 supports it, but `/start` rejects it (unknown key).
- `force` — allow starting a script already running under the same name. PM2 supports it, but `/start` rejects it (unknown key).
- `source_map_support` — enable source-map-aware stack traces. PM2 supports it, but `/start` rejects it (unknown key).
- `instance_var` — env var name exposing instance index in cluster mode. PM2 supports it, but `/start` rejects it (unknown key).
- `filter_env` — strip matching env vars from inherited `process.env`. PM2 supports it, but `/start` rejects it — the agent manages `filter_env` itself.
- `increment_var` — auto-increment this env var. Accepted by `/start`, but the key must be a valid env name, not reserved, and present in `env`.

```json
{
  "node_args": ["--inspect"],
  "cron_restart": "0 0 * * *",
  "vizion": false,
  "post_update": ["npm install"],
  "force": false,
  "source_map_support": true,
  "instance_var": "INSTANCE_ID",
  "filter_env": ["EXAMPLE_"],
  "increment_var": "PORT"
}
```

## Complete payload

Full merged payload for copy-paste. `script`, `cwd`, and `interpreter` are required; every other key is optional and shown with its sample value.

```json
{
  "script": "./app/server.js",
  "name": "example-app",
  "cwd": "C:\\Example\\Application",
  "args": ["--port", "4000"],
  "interpreter": "C:\\Program Files\\nodejs\\node.exe",
  "interpreter_args": ["--max-old-space-size=256"],
  "namespace": "example",
  "exec_mode": "fork",
  "instances": 1,
  "autorestart": true,
  "watch": false,
  "ignore_watch": ["node_modules", "temp", "*.log"],
  "watch_delay": 500,
  "windowsHide": true,
  "max_restarts": 10,
  "min_uptime": "5s",
  "restart_delay": 2000,
  "exp_backoff_restart_delay": 200,
  "max_memory_restart": "256M",
  "kill_timeout": 1000,
  "listen_timeout": 5000,
  "shutdown_with_message": false,
  "wait_ready": false,
  "stop_exit_codes": [0],
  "kill_retry_time": 200,
  "env": {
    "NODE_ENV": "production",
    "PORT": "4000"
  },
  "env_production": {
    "NODE_ENV": "production"
  },
  "env_development": {
    "NODE_ENV": "development"
  },
  "output": "./logs/example-out.log",
  "error": "./logs/example-error.log",
  "log_file": "./logs/example-combined.log",
  "pid_file": "./pids/example.pid",
  "merge_logs": true,
  "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
  "time": true,
  "combine_logs": true,
  "disable_logs": false,
  "node_args": ["--inspect"],
  "cron_restart": "0 0 * * *",
  "vizion": false,
  "post_update": ["npm install"],
  "force": false,
  "source_map_support": true,
  "instance_var": "INSTANCE_ID",
  "filter_env": ["EXAMPLE_"],
  "increment_var": "PORT"
}
```
