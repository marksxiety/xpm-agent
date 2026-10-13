# Security

`POST /pm2/start` launches an arbitrary script as the service account. **The agent is remote code execution by design**, so protect it the way you would protect SSH access to the machine.

The guardrails below stop accidental misuse and casual abuse. They are **not** a hard security boundary. When the port is reachable beyond localhost, your boundary is `AUTH_TOKEN` plus OS-level isolation.

## Hardening checklist

- [ ] Set `AUTH_TOKEN` if the agent is reachable from anything other than localhost
- [ ] Restrict network access with a firewall or reverse-proxy rule (there is no built-in IP allowlist)
- [ ] Run the agent and the PM2 daemon as a dedicated, low-privilege service account
- [ ] Lock down `%USERPROFILE%\.pm2` to that account (see [Known limits](#known-limits))
- [ ] Set `APP_ROOTS` and `INTERPRETER_ROOTS` to limit where processes and interpreters can live
- [ ] Keep `PM2_NODE_OPTIONS` unset on the daemon

Configuration for each of these is covered in [SETUP.md](./SETUP.md).

## Authentication

Set `AUTH_TOKEN` in `.env` (or `.env.production`). Every `/pm2/*` request must then send:

```
Authorization: Bearer <AUTH_TOKEN>
```

Requests without a valid token are rejected with `401`. Leaving `AUTH_TOKEN` empty disables auth, which is acceptable only for a strictly local tool.

> **CORS is not access control.** It only restricts browsers. `curl`, scripts, and servers ignore it, so `AUTH_TOKEN` is the only thing keeping callers out.

## What the agent enforces

All checks run on `POST /pm2/start` unless noted.

| Area | Rule |
|---|---|
| **Working directory** | `cwd` is required, absolute, contains no `..` segments, is never the agent's own directory, and must be inside `APP_ROOTS` when configured. |
| **Execution mode** | Always `fork` with `instances: 1`. Cluster workers fork from the daemon and would inherit its environment. |
| **Environment** | The child gets exactly the payload `env` plus PM2 runtime metadata. Reserved PM2 keys and loader options are rejected with `422`: `NODE_OPTIONS`, `BUN_OPTIONS`, `NODE_PATH`, `PYTHONSTARTUP`, `PYTHONPATH`, `PHPRC`, `PHP_INI_SCAN_DIR`, `LD_PRELOAD`. |
| **Interpreter** | Must be an absolute path for the declared `targetOs`, or `"none"` for bare binaries. The agent does not validate the language. Executables can be restricted to `INTERPRETER_ROOTS`. |
| **Interpreter args** | `interpreter_args` must be allowed by `INTERPRETER_FLAGS`. Until an interpreter is configured, its args are rejected. `path` rules must resolve inside `cwd`. |
| **Naming** | `name` and `namespace` must match `^[A-Za-z0-9._-]{1,64}$`. |
| **Self-protection** | The agent's own processes (`xpm-agent`, `xpm-client`, `xpm-server` in the `XPM` namespace) cannot be started, stopped, restarted, reloaded, or deleted. Read-only `describe` and `logs`, and `flush`, are still allowed. |
| **Fail closed** | If the guard cannot inspect a target on a mutating route, the request fails with `503`. |
| **Responses** | `pm2_env.env` and `filter_env` are never returned. |

## Known limits

| Limit | Impact | Mitigation |
|---|---|---|
| **Same-user access** | Anything running as the service account can read stored env values via `pm2 jlist` and `%USERPROFILE%\.pm2\dump.pm2` (and `/proc/<pid>/environ` on Linux). | Run the agent as a dedicated account. |
| **`dump.pm2` is plaintext** | The agent auto-saves after start, stop, and delete. The dump holds each app's `env` values and `filter_env` key names. | Restrict the folder to the service account:<br>`icacls "%USERPROFILE%\.pm2" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"` |
| **Daemon environment** | Fork children do not inherit the daemon's env (verified by `src/tests/integration/start-isolation.test.ts` against a daemon carrying an extra secret). However, the daemon inherits the agent's env when the agent starts it, and a daemon-side `PM2_NODE_OPTIONS` is appended to every fork child's interpreter args. | Keep `PM2_NODE_OPTIONS` unset and run the daemon as the service account. |
| **Script execution is not confined** | `script` (like `interpreter`) may be any absolute path outside `APP_ROOTS`, so the app-root allowlist confines only `cwd`, not what executes. | Restrict `INTERPRETER_ROOTS`; run the agent as a dedicated account and rely on OS file permissions. |
| **No IP allowlist** | Anyone who can reach the port can attempt requests. | Firewall or reverse-proxy rule when reachable beyond localhost. |

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through [GitHub's private vulnerability reporting](https://github.com/marksxiety/xpm-agent/security/advisories/new) and include the affected version, reproduction steps, and the impact you observed.