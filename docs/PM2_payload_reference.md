# PM2 Payload Reference

Reference for a PM2 ecosystem-style process payload. **Every field is optional except `script`** — the entry file is required; everything else falls back to PM2 defaults.

## Identity & script

Identifies the process and defines how its entry script is invoked: the file path, display name, working directory, arguments, and interpreter.

- `script` — **required** — entry file to run.
- `name` — process name shown in `pm2 list`.
- `cwd` — working directory for the process.
- `args` — arguments passed to the script (array or string).
- `interpreter` — `"node"`, `"python3"`, `"php"`, `"none"`, or a full exe path. **This API requires the absolute path** (e.g. `C:\Program Files\nodejs\node.exe`) or `"none"` — bare names like `"node"` are rejected by `/start`.
- `interpreter_args` — arguments passed to the interpreter itself.
- `namespace` — logical grouping (`pm2 list` can show/filter by this).

```json
{
  "script": "./app/server.js",
  "name": "example-app",
  "cwd": "C:\\Example\\Application",
  "args": ["--port", "4000"],
  "interpreter": "node",
  "interpreter_args": ["--max-old-space-size=256"],
  "namespace": "example"
}
```

## Process behavior

Controls how the process runs: execution mode, instance count, auto-restart on crash, and file watching for hot reloads.

- `exec_mode` — `"fork"` | `"cluster"` (real values are `"fork"`/`"cluster"`, not `"fork_mode"`).
- `instances` — number of instances, or `"max"`/`-1` for all CPU cores (cluster only).
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

- `max_restarts` — stop retrying after N unstable restarts.
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
- `post_update` — commands run after a `pm2 pull`/deploy update.
- `force` — allow starting a script already running under the same name.
- `source_map_support` — enable source-map-aware stack traces.
- `instance_var` — env var name exposing instance index in cluster mode.
- `filter_env` — strip matching env vars from inherited `process.env`.
- `increment_var` — auto-increment this env var per cluster instance.

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

Full merged payload for copy-paste. Only `script` is required; every other key is optional and shown with its sample value.

```json
{
  "script": "./app/server.js",
  "name": "example-app",
  "cwd": "C:\\Example\\Application",
  "args": ["--port", "4000"],
  "interpreter": "node",
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
