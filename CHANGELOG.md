# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Log rotation via PM2's official `pm2-logrotate` module, installed once per host
  with `bun run setup:logrotate` (pinned `2.7.0`; `max_size 10M`, `retain 30`,
  `compress true`). See `SETUP.md`.
- `GET /pm2/logs/:id` now returns a `size` object with the raw byte footprint of
  each returned stream — the current log file plus every rotated sibling
  (`<stem>__*.log` / `.log.gz`). `size` follows the `type` selection.
- `GET /pm2/list?logs=N` now attaches the same `logs.size` object to each summary.
- `GET /pm2/system` and `GET /pm2/list?overview=true` now include a `logs` object
  in the host overview: `totalBytes` and `fileCount` across every `.log`/`.log.gz`
  file in the PM2 logs directory (all namespaces, current and rotated), for
  dashboard alerting/traceability.
- `DELETE /pm2/logs/:id` clears a process's logs: `?stream=all|out|err`
  (default `all`) and `?scope=active|rotated|all` (default `active`).
  `active` truncates the open file(s) to 0 bytes in place (never unlinked, so the
  running process keeps writing), `rotated` deletes archive files
  (`<stem>__<date>.log[.gz]`, `<stem>.log.<n>`, `<stem>.log.gz`), and `all` does
  both. Responds with per-stream `truncated`/`deleted` byte counts and a total
  `bytesFreed`. Invalid `stream`/`scope` values return `400 INVALID_LOG_QUERY`;
  disk I/O failures return `500 LOG_IO_FAILED`; the agent's own process is refused
  with `409`.

### Changed

- `DELETE /pm2/delete/:id?delete_logs=true` now also removes a process's rotated
  log siblings, so rotation no longer orphans files after a delete.

### Documentation

- Updated `SETUP.md`, `README.md`, `ROUTES.md`, and the OpenAPI schema/metadata for
  log rotation and the new log-size fields.

## [2.1.0] - 2026-10-16

### Added

- `GET /describe/:id` now surfaces PM2 registration settings in `describe`:
  `max_restarts`, `min_uptime`, `restart_delay`, `kill_timeout`, `ignore_watch`,
  `watch_delay`, and `windowsHide`. Like the existing conditional keys, they are
  included only when configured — an absent key means PM2 applied its built-in
  default.

### Removed

- Deleted `docs/templates.md`. Start-payload samples and field documentation live
  in `ROUTES.md` (`POST /start`) and `PM2_payload_reference.md`.

### Documentation

- Updated `ROUTES.md`, the OpenAPI schema, and route metadata for the new
  `describe` registration settings.

## [2.0.2] - 2026-10-13

### Fixed

- `script` is no longer rejected for resolving outside `cwd`, unblocking the documented
  interpreter-as-script recipes (`php -S` with `script: "C:\php\php.exe"`, `go run` with
  `go.exe`). Absolute script paths are passed to PM2 as-is.

### Changed

- Removed the pre-flight script existence check. A missing script no longer returns `422`
  with `field: "script"`; PM2's own `Script not found` is translated to
  `400 SCRIPT_NOT_FOUND` as before. `cwd` existence is still validated and reported as
  `422 field: "cwd"`.

### Documentation

- Updated `ROUTES.md`, `PM2_payload_reference.md`, `SECURITY.md`, and route metadata to
  reflect that script resolution and existence are PM2's responsibility.

## [2.0.1] - 2026-10-12

### Added

- Public `GET /` liveness endpoint returning `{ success, message, info: { pid } }`
  with the agent's OS process id. It is documented in Swagger and excluded from
  `AUTH_TOKEN` checks.

## [2.0.0] - 2026-10-11

### Breaking changes

- `interpreter_args` are no longer allowlisted by built-in runtime profiles. They are
  rejected unless the server configures `INTERPRETER_FLAGS`; a client sending
  `--env-file` / `--max-old-space-size=<n>` (Node) or `-u`/`-O`/`-B` (Python) now receives
  `422` until those flags are configured.
- `windowsHide` now defaults to `true` (previously `false`).
- `cwd` is now required, unknown payload keys are rejected with `422` (no silent
  stripping), and `exec_mode: 'cluster'` / `instances > 1` are rejected. Update
  xpm-client (send `cwd`, drop cluster, tolerate `422`) before upgrading an agent.

### Added

- `INTERPRETER_FLAGS` — JSON allowlist of interpreter flags keyed by executable base name
  (`exact`, `pattern`, and `path` rule kinds).
- `INTERPRETER_ROOTS` — optional allowlist of directories the interpreter executable must
  live under.
- `validateConfig()` — malformed interpreter config now fails fast at startup instead of on
  the first request.
- Duration strings (`'10s'`, `'500ms'`, `'2m'`, `'1h'`) are accepted for `restart_delay`,
  `kill_timeout`, and `watch_delay`, and are normalized to milliseconds.
- `parseFlagRules()` to build flag allowlists from the JSON config.

### Changed

- The agent is now language-agnostic: any absolute interpreter path is accepted (the
  `node`/`bun`/`php`/`python`/`go` allowlist is removed), and script-extension plus
  `artisan`/`manage.py` entrypoint conventions are dropped.
- `describe` returns `version`, `node_version`, and `node_env` whenever PM2 provides them,
  regardless of interpreter (previously nulled for non-Node processes).

### Fixed

- Fail closed on the agent self-management guard and cover `describe`/`logs`/`flush`.
- Reject unknown request keys instead of silently stripping them.
- Require `cwd`; restrict `exec_mode`/`instances` to `fork`/`1`; reject cluster mode.
- Validate env keys, interpreter flags, `cwd`, and `increment_var` before dispatch.
- Refuse to boot without `AUTH_TOKEN` unless `ALLOW_INSECURE` is set; treat `AUTH_TOKEN`
  as optional and allow `interpreter: "none"` without a token.
- Harden the isolation canary on Windows (patched pipes, dedicated runner, platform-neutral
  PWD check, PM2 version-metadata allowlist).

### Documentation

- Revised `ROUTES.md`, `PM2_payload_reference.md`, `templates.md`, `README.md`, `SETUP.md`,
  and `.env.example` for the runtime-agnostic interpreter, `INTERPRETER_FLAGS` /
  `INTERPRETER_ROOTS`, duration fields, and the new `windowsHide` default.

## [1.2.0] - 2026-10-07

### Added

- Agent self-guard (`rejectAgentTarget`), start-payload sanitization, and dump on stop in
  `ProcessController`; `AGENT_SELF_MANAGEMENT_FORBIDDEN` (409).
- `sanitizeProcessConfig` with `filter_env`, namespace fallback, and `max_restarts`
  handling.
- Bun runtime profile split; script/interpreter matching by runtime family.
- `family` field on `RuntimeProfile` for `node`/`bun` grouping; relative `cwd` rejection.

### Changed

- Hardened the ecosystem config (`min_uptime`, exponential backoff, unlimited restarts,
  `max_memory_restart`); fixed `windowsHide` handling.

### Documentation

- PM2 payload reference, ROUTES, SETUP, and README updates covering sanitization, absolute
  `cwd`, Node-only cluster mode, and environment isolation.

## [1.1.7] - 2026-10-05

### Added

- `min_uptime`, `restart_delay`, `max_memory_restart`, `increment_var`, and `kill_timeout`
  in `StartPayload`.
- `parseDurationMs` to normalize PM2 duration strings to milliseconds.
- `min_uptime` validation in `inspectStart` and normalization to ms before `pm2.start`.

### Documentation

- Documented the new start fields in ROUTES and the `/start` route metadata.

## [1.1.6] - 2026-10-02

### Added

- Duplicate-name rejection with `409 PROCESS_NAME_CONFLICT` in `startProcess` via
  `findProcessByName` and `runExclusive`; `ProcessNameConflict` type.

### Documentation

- Documented the 409 name-conflict response in ROUTES and the `/start` route metadata.

## [1.1.5] - 2026-09-25

### Added

- `Pm2Connection` with a shared connect path and RPC timeout; `PM2_RPC_TIMEOUT` (504).

### Changed

- Routed `ProcessController.withPM2` through the injected `Pm2Connection`; check-port
  preflight delegates to `readAgentProcesses` / `isAgentHoldingPort` in the PM2 CLI.

## [1.1.4] - 2026-09-23

### Added

- `describeProcessDetails` mapping `pm2_env` to summary/describe/metrics; describe now
  returns this object instead of a summary array, with OpenAPI schemas.

### Changed

- `startProcess` defaults the namespace to `default` and mirrors it into `env.namespace`.

### Documentation

- Start-payload templates for Node, Python, PHP, and Go; describe response shape and fields.

## [1.1.2] - 2026-09-18

### Added

- Startup OS-listener check reporting the listening PID and process name;
  `findListeningPidsOnHost`, `findProcessName`, and `formatPortInUseError`.

### Changed

- `check-port` reads the OS listener table with a bind-probe fallback.

## [1.1.1] - 2026-09-18

### Added

- `resolveServerPort` and `formatPortError` validators (exit code 2); check-port preflight
  that skips when `xpm-agent` is already online; listen with `reusePort: false`.

### Changed

- Dropped the `SERVER_PORT` default getter in favor of strict validation; added
  `stop_exit_codes: 2` so PM2 does not retry startup errors.

### Documentation

- Documented the required `SERVER_PORT` and check-port preflight in SETUP.

## [1.1.0] - 2026-09-17

### Added

- CPU `usagePercent` and memory host metrics via `systeminformation` (async
  `getHostMetrics` / `toPercent`); baseline primed at startup.

### Changed

- Replaced the OS module CPU cores/model/load-average fields with `usagePercent`.

### Documentation

- Documented `usagePercent`, the `/pm2/system` route, and the 500 ms baseline note.

## [1.0.1] - 2026-09-14

### Fixed

- PM2 entry-point detection for Bun apps so the server starts correctly.

## [1.0.0] - 2026-08-31

### Added

- Bearer-token authentication (`AUTH_TOKEN`) gating `/pm2` routes; `UNAUTHORIZED` (401) and
  timing-safe `isValidBearerToken`.
- `/flush/:id` now requires a numeric process id.
- Build workflow and `build` script; module entry points to `dist/index.js`.

### Changed

- Renamed the application to `xpm-agent`; production start builds before the PM2 launch.

### Documentation

- README quickstart, auth, and build badge; `AUTH_TOKEN` and `.env.production` override
  behavior.

## [0.0.4] - 2026-08-28

### Added

- Auto-save (PM2 dump) on start and delete so services survive a server restart.

### Changed

- Renamed the application to `xpm-api`.

## [0.0.3] - 2026-08-27

### Added

- Host metrics: `/pm2/system` returns host metrics; `/pm2/list?overview` combines host
  metrics with the process list; `getHostMetrics` and overview response schemas.

### Changed

- Split services into `process.controller` and `system.controller`; routes use controllers.
- Extracted `formatElysiaErrorResponse`; `DELETE /delete` uses the `delete_logs` query
  parameter instead of a body.

### Documentation

- Documented `/logs`, `?logs`, `?overview`, `/system`, and `CORS_ORIGIN`.

## [0.0.2] - 2026-08-26

### Added

- `/pm2/logs/:id` endpoint and `?logs` query on `/list`; `tailLines` utility
  (`DEFAULT_TAIL_LINES`, `MAX_TAIL_LINES`); `LogStreamType` and `ProcessLogs` types.

### Changed

- Updated the ecosystem config (app name, `time: true`); ignored `/scripts` and `.env`.

## [0.0.1] - 2026-08-25

### Added

- CORS support: `CORS_ORIGIN` config getter, `@elysiajs/cors`, and
  `CORS_ORIGIN_NOT_ALLOWED` (403).
- `ip_address` on `ProcessSummary`, populated via `getServerIpv4` / `resolveServerIpv4`.

### Changed

- Added a flat ESLint config plus lint script/workflow; typed `pm2_env` and error shapes
  (removed `as any` casts).

### Documentation

- Documented the `ipv4` field in ROUTES.

## [0.0.1-beta] - 2026-08-24

### Added

- Structured error codes in API responses (`ApiResponse.code`) with error-handling types.

### Changed

- `classifyPm2Error` now returns structured error codes instead of a status and message.

### Fixed

- More detailed validation and classification error responses in the routes and PM2 service.

## [0.0.3-alpha] - 2026-08-23

### Changed

- Removed the `SERVER_TIMEZONE` getter; simplified `getCurrentTimeStamp` to `Date.now`.

### Documentation

- Pointed the release badge to the releases page; dropped `SERVER_TIMEZONE` from SETUP and
  the env example.

## [0.0.2-alpha] - 2026-08-23

### Added

- GitHub Actions workflows running `bun run typecheck` and `bun test` on push/PR.
- `pm2-windows-startup` dependency for auto-start on boot.

### Changed

- Rewrote the README with badges, a library overview, and docs links; added the SETUP guide
  (install, PM2 run, Windows auto-start).

## [0.0.1-alpha] - 2026-08-23

### Added

- Initial release: an ElysiaJS REST API exposing a PM2 service with `/pm2` CRUD routes for
  process management.

[2.1.0]: https://github.com/marksxiety/xpm-agent/compare/v2.0.2...v2.1.0
[2.0.2]: https://github.com/marksxiety/xpm-agent/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/marksxiety/xpm-agent/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/marksxiety/xpm-agent/compare/v1.2.0...v2.0.0
[1.2.0]: https://github.com/marksxiety/xpm-agent/compare/v1.1.7...v1.2.0
[1.1.7]: https://github.com/marksxiety/xpm-agent/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/marksxiety/xpm-agent/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/marksxiety/xpm-agent/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/marksxiety/xpm-agent/compare/v1.1.2...v1.1.4
[1.1.2]: https://github.com/marksxiety/xpm-agent/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/marksxiety/xpm-agent/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/marksxiety/xpm-agent/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/marksxiety/xpm-agent/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/marksxiety/xpm-agent/compare/v0.0.4...v1.0.0
[0.0.4]: https://github.com/marksxiety/xpm-agent/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/marksxiety/xpm-agent/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/marksxiety/xpm-agent/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/marksxiety/xpm-agent/compare/v0.0.1-beta...v0.0.1
[0.0.1-beta]: https://github.com/marksxiety/xpm-agent/compare/v0.0.3-alpha...v0.0.1-beta
[0.0.3-alpha]: https://github.com/marksxiety/xpm-agent/compare/v0.0.2-alpha...v0.0.3-alpha
[0.0.2-alpha]: https://github.com/marksxiety/xpm-agent/compare/v0.0.1-alpha...v0.0.2-alpha
[0.0.1-alpha]: https://github.com/marksxiety/xpm-agent/releases/tag/v0.0.1-alpha
