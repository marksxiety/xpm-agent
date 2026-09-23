# Payload Templates

Copy-paste templates for `POST /pm2/start`, grouped by language. Each section carries the UI metadata (what to lock, hide, or derive), a sample payload, and the language-specific gotchas.

Framework templates (Nuxt, Next, Nest, Laravel, ...) will be added later as new sections reusing this format — they build on the language recipes below.

> Base URL `http://localhost:4000/pm2`. When `AUTH_TOKEN` is set, every request needs `Authorization: Bearer <AUTH_TOKEN>`. All responses use the envelope `{ success, message, code?, info }` — see [ROUTES.md](./ROUTES.md).

## Global rules

- `name`, `script`, and `interpreter` are required.
- `interpreter` must be an absolute path to the executable for the declared `targetOs`, or `"none"` when `script` is itself an executable/binary. Bare names (`"node"`, `"python"`) are rejected.
- `targetOs` is `"win32"` (default) or `"linux"` — it only drives interpreter path validation.
- `namespace` is optional; PM2 files the process under `"default"` when omitted.
- Every other field is passed to PM2 **verbatim** — omitted fields fall back to PM2's own defaults. The API applies no defaults of its own.
- Log lines are always timestamped (PM2 `time: true`).
- Windows paths: write `\\` in raw JSON (`C:\\apps\\...`) or use forward slashes (`C:/apps/...`) — both are accepted.

## Capability matrix

Field visibility source for the UI.

| Language | `interpreter` | `interpreter_args` | `cluster` | Required extras |
|---|---|---|---|---|
| Node | absolute `node.exe` | yes | yes | — |
| npm | absolute `node.exe` | yes | no (not meaningful) | `script` locked to `npm-cli.js` |
| Python | absolute `python.exe` (system or venv) | yes | no | — |
| PHP | absolute `php.exe`, or `"none"` for the built-in server | no | no | `php -S` uses the `"none"` inversion |
| Go | `"none"` (compiled binary) | no | no | build the binary first |

---

## Node

Run a `.js`/`.mjs`/`.cjs` entry file directly under `node.exe`.

**UI metadata**

- Lock: nothing
- Hide: nothing
- Derive: nothing

```json
{
  "name": "my-node-app",
  "namespace": "apps",
  "cwd": "C:\\apps\\my-node-app",
  "script": "index.js",
  "args": ["--port", "3000"],
  "interpreter": "C:\\Program Files\\nodejs\\node.exe",
  "interpreter_args": ["--env-file=.env"],
  "exec_mode": "fork",
  "instances": 1,
  "autorestart": true,
  "windowsHide": true,
  "env": { "NODE_ENV": "production", "PORT": "3000" }
}
```

**Gotchas**

- `interpreter_args` becomes node's `node_args`: the process starts as `node --env-file=.env index.js --port 3000`.
- `env` is injected as real process environment and takes precedence over values loaded from `--env-file` (Node docs). Drop the `--env-file` entry if `.env` is the single source of truth, or drop the overlapping `env` keys.
- Cluster mode is allowed: `"exec_mode": "cluster"` with `"instances": 2` (or `"max"`). `fork` + `instances > 1` is rejected.

---

## npm

Run an npm script (`npm run dev`, `npm start`, ...) under PM2.

**UI metadata**

- Lock: `script` = `<nodejs install>\node_modules\npm\bin\npm-cli.js`, `interpreter` = `<nodejs install>\node.exe`
- Hide: `exec_mode`, `instances`
- Derive: `script`/`interpreter` from a Node.js install directory (default `C:\Program Files\nodejs`)

```json
{
  "name": "my-npm-app",
  "namespace": "apps",
  "cwd": "C:\\apps\\my-npm-app",
  "script": "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
  "args": ["run", "dev"],
  "interpreter": "C:\\Program Files\\nodejs\\node.exe",
  "autorestart": true,
  "windowsHide": true
}
```

**Gotchas**

- Do **not** use `"interpreter": "none"` with `npm.cmd` — PM2 spawns the script without a shell and Windows throws `EINVAL`. Pointing `node.exe` at `npm-cli.js` is exactly what `npm.cmd` does internally.
- `args` are the npm CLI arguments, e.g. `["run", "dev"]`, `["start"]`, `["run", "build"]`.
- PM2 supervises the npm CLI process; scripts that daemonize or detach may not restart correctly.

---

## Python

Run a `.py` entry file with a system Python.

**UI metadata**

- Lock: nothing
- Hide: `exec_mode`, `instances`
- Derive: nothing

```json
{
  "name": "my-python-app",
  "namespace": "apps",
  "cwd": "C:\\apps\\my-python-app",
  "script": "app.py",
  "args": ["--port", "5000"],
  "interpreter": "C:\\Python312\\python.exe",
  "interpreter_args": ["-u"],
  "autorestart": true,
  "windowsHide": true
}
```

**Gotchas**

- `interpreter_args` becomes `node_args` and is prepended: the process starts as `python.exe -u app.py --port 5000`.
- PM2 already sets `PYTHONUNBUFFERED=1` for any interpreter path containing `python`, so `["-u"]` is optional.

---

## Python (venv)

Same as Python direct, with the interpreter pointing at the venv's own `python.exe` (verified working with a `venv\Scripts\python.exe` layout).

**UI metadata**

- Lock: nothing
- Hide: `exec_mode`, `instances`
- Derive: `interpreter` = `<cwd>\<venv folder>\Scripts\python.exe` — offer a folder picker (`venv`, `.venv`, custom) since the folder name is arbitrary

```json
{
  "name": "my-venv-app",
  "namespace": "apps",
  "cwd": "C:\\apps\\my-venv-app",
  "script": "app.py",
  "args": ["--port", "5000"],
  "interpreter": "C:\\apps\\my-venv-app\\venv\\Scripts\\python.exe",
  "autorestart": true,
  "max_restarts": 50,
  "windowsHide": true,
  "watch": false
}
```

**Gotchas**

- No activation step is needed — pointing at the venv's `python.exe` is enough; it resolves `sys.prefix` and uses the venv's `site-packages` automatically.
- Do not lock the interpreter to `.venv` — the folder name depends on how the venv was created (`venv`, `.venv`, `.myenv`, ...). Always let the user confirm the path.
- `VIRTUAL_ENV` in `env` is optional and only useful for tooling that reads it; it does not make the venv work.

---

## PHP

Run PHP's built-in web server (`php -S`). Currently no framework conventions — a Laravel/artisan template will be added with the framework recipes.

**UI metadata**

- Lock: `script` = absolute `php.exe`, `interpreter` = `"none"`
- Hide: `interpreter_args`, `exec_mode`, `instances`
- Derive: `args` default `["-S", "127.0.0.1:8080", "-t", "public"]`

```json
{
  "name": "php-web",
  "namespace": "apps",
  "cwd": "C:\\apps\\my-php-app",
  "script": "C:\\php\\php.exe",
  "args": ["-S", "127.0.0.1:8080", "-t", "public"],
  "interpreter": "none",
  "autorestart": true,
  "windowsHide": true
}
```

**Gotchas**

- Why the inversion: PM2 always launches `interpreter <script> <args>`. With `interpreter: "php.exe"` and `script: "server.php"` the `-S` flag would land **after** the script (`php server.php -S ...`) and no server would start. Putting `php.exe` in `script` with `interpreter: "none"` yields the real `php -S 127.0.0.1:8080 -t public`.
- Add a router as the last argument when needed: `["-S", "127.0.0.1:8080", "-t", "public", "server.php"]` (path relative to `cwd` or absolute).
- `interpreter_args` and cluster mode are rejected for PHP — the config guide returns `422 INVALID_PROCESS_CONFIGURATION`.

---

## Go

Run a compiled Go binary.

**UI metadata**

- Lock: `interpreter` = `"none"`
- Hide: `interpreter_args`, `exec_mode`, `instances`
- Derive: `script` = compiled binary path (e.g. `my-go-app.exe` inside `cwd`)

```json
{
  "name": "my-go-app",
  "namespace": "apps",
  "cwd": "C:\\apps\\my-go-app",
  "script": "my-go-app.exe",
  "args": ["--port", "5000"],
  "interpreter": "none",
  "autorestart": true,
  "windowsHide": true
}
```

**Gotchas**

- Build first: `go build -o my-go-app.exe .` — PM2 runs the binary, it does not compile.
- Never use a `.go` source file as `script` with the `go` interpreter: PM2 would invoke `go.exe <main.go path> ...`, which is invalid. `interpreter: "none"` + the compiled binary is the supported path.
- Dev-only alternative (`go run`): `"script": "C:\\Go\\bin\\go.exe"`, `"interpreter": "none"`, `"args": ["run", "."]` with `cwd` on the module. PM2 supervises the `go` process, not the compiled child — use it for local work only.
- Linux target: drop the `.exe`, e.g. `"script": "my-go-app"` with `"targetOs": "linux"`.

---

## Error mapping for the UI

| Response | What it means | UI handling |
|---|---|---|
| `422 VALIDATION_FAILED` | Body shape is wrong (missing/non-string field, bad type) | Form-level banner with `message` |
| `422 INVALID_PROCESS_CONFIGURATION` | Config-guide violation; `info` is `[{ field, message }]` | Render each issue under its matching input |
| `400 SCRIPT_NOT_FOUND` | Resolved `script` path does not exist on the server | Error under `script` (and `cwd`) |
| `400 PARSE` | Malformed JSON body | Should not happen from a generated payload |
| `401 UNAUTHORIZED` | Missing/invalid bearer token | Prompt for token |
| `503 PM2_DAEMON_UNAVAILABLE` | PM2 daemon not reachable | Toast / retry |
| `500 PM2_OPERATION_FAILED` | PM2 rejected the start | Toast with `message` |
