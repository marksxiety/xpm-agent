"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { execFileSync } = require("child_process");

const ENV_FILE = path.join(__dirname, ".env");

const PREFIX = "pm2";
const LABEL_NAMES = ["name", "namespace", "pm_id"];
const DEFAULT_NAMESPACE = "default";
// Library-level fallback for callers that omit timeoutMs. The environment
// variable is required, so a PM2-managed run never relies on this.
const DEFAULT_TIMEOUT_MS = 5000;
const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

const NETSTAT_COMMAND = "netstat";
const TASKLIST_COMMAND = "tasklist";

// [suffix, help, type]. All prefixed with `pm2_` to match the original.
// Exactly one series per process per entry, labelled name/namespace/pm_id.
const METRICS = [
  ["cpu", "PM2 process CPU usage in percent (0 when unknown)", "gauge"],
  ["memory", "PM2 process memory usage in bytes (0 when unknown)", "gauge"],
  [
    "uptime",
    "Seconds since the process started, when online; 0 otherwise",
    "gauge",
  ],
  [
    "start_time_seconds",
    "Process start time as a Unix timestamp in seconds (pm2_env.pm_uptime / 1000; 0 when unknown)",
    "gauge",
  ],
  [
    "restarts_total",
    "Total number of PM2 restarts (pm2_env.restart_time)",
    "counter",
  ],
  [
    "unstable_restarts_total",
    "Total number of PM2 unstable restarts (pm2_env.unstable_restarts)",
    "counter",
  ],
  [
    "status",
    "Fixed code for pm2_env.status (see README; must never be renumbered or reused)",
    "gauge",
  ],
];

// Fixed mapping from pm2_env.status to pm2_status. These numbers are part
// of the metric's contract: never renumber or reuse them. Any status not listed
// here (including "unknown") maps to 0.
const STATUS_CODES = Object.freeze({
  online: 1,
  launching: 2,
  stopping: 3,
  "waiting restart": 4,
  stopped: 5,
  errored: 6,
  "one-launch-status": 7,
});

function statusCode(status) {
  const code = STATUS_CODES[status];
  return code === undefined ? 0 : code;
}

// Lower is worse; 6 is "healthy or idle". Unknown statuses deliberately fall
// through to 5 so they surface as unhealthy rather than being treated as fine.
function getSeverityRank(env) {
  const status = env.status;

  if (status === "errored") return 1;

  if (status === "stopped") {
    const isOneShot = env.autorestart === false;
    if (isOneShot) {
      const failed =
        env.exit_code !== undefined &&
        env.exit_code !== null &&
        env.exit_code !== 0;
      return failed ? 2 : 6;
    }
    return 3;
  }

  if (status === "waiting restart") return 4;
  if (status === "stopping" || status === "launching") return 5;
  if (status === "online") return 6;
  if (status === "one-launch-status") return 6;

  return 5;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function escapeLabel(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function renderLabelSet(labels) {
  const keys = Object.keys(labels || {});
  if (keys.length === 0) return "";
  const body = keys.map((k) => `${k}="${escapeLabel(labels[k])}"`).join(",");
  return `{${body}}`;
}

// Pure: PM2 list entries -> one sample per (metric, process).
function buildSamples(list, now = Date.now()) {
  const samples = [];
  for (const proc of list || []) {
    const env = proc.pm2_env || {};
    const monit = proc.monit || {};
    const online = env.status === "online";

    const labels = {
      name: String(proc.name),
      namespace: String(env.namespace || DEFAULT_NAMESPACE),
      pm_id: String(proc.pm_id),
    };

    const startedAtMs = toNumber(env.pm_uptime);
    const uptime =
      online && startedAtMs > 0
        ? Math.max(0, Math.round((now - startedAtMs) / 1000))
        : 0;
    const startTimeSeconds = startedAtMs / 1000;

    const values = {
      cpu: toNumber(monit.cpu),
      memory: toNumber(monit.memory),
      uptime,
      start_time_seconds: startTimeSeconds,
      restarts_total: toNumber(env.restart_time),
      unstable_restarts_total: toNumber(env.unstable_restarts),
      status: statusCode(env.status),
    };

    for (const [suffix, help, type] of METRICS) {
      samples.push({
        name: `${PREFIX}_${suffix}`,
        help,
        type,
        labels,
        value: values[suffix],
      });
    }
  }
  return samples;
}

// Pure: samples -> Prometheus text exposition. A fresh sample set is built on
// every scrape, so processes that disappeared leave no stale series behind.
function render(samples) {
  const ordered = [...(samples || [])].sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    const la = renderLabelSet(a.labels);
    const lb = renderLabelSet(b.labels);
    if (la !== lb) return la < lb ? -1 : 1;
    return 0;
  });

  const lines = [];
  const declared = new Set();
  for (const sample of ordered) {
    if (!declared.has(sample.name)) {
      declared.add(sample.name);
      lines.push(`# HELP ${sample.name} ${sample.help}`);
      lines.push(`# TYPE ${sample.name} ${sample.type}`);
    }
    lines.push(
      `${sample.name}${renderLabelSet(sample.labels)} ${sample.value}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function parseConfig(env = process.env) {
  const rawPort = env.EXPORTER_PORT;
  const portText = rawPort === undefined ? "" : String(rawPort).trim();
  if (portText === "") {
    throw new Error(
      "EXPORTER_PORT is not set — define it in exporter/.env (e.g. EXPORTER_PORT=9209)",
    );
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid EXPORTER_PORT "${rawPort}" (expected an integer between 1 and 65535)`,
    );
  }

  const rawHost = env.EXPORTER_HOST;
  const host = rawHost === undefined ? "" : String(rawHost).trim();
  if (host === "") {
    throw new Error(
      "EXPORTER_HOST is not set — define it in exporter/.env (e.g. EXPORTER_HOST=0.0.0.0)",
    );
  }

  const rawTimeout = env.EXPORTER_TIMEOUT_MS;
  const timeoutText =
    rawTimeout === undefined ? "" : String(rawTimeout).trim();
  if (timeoutText === "") {
    throw new Error(
      "EXPORTER_TIMEOUT_MS is not set — define it in exporter/.env (e.g. EXPORTER_TIMEOUT_MS=5000)",
    );
  }
  const timeoutMs = Number(timeoutText);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error(
      `Invalid EXPORTER_TIMEOUT_MS "${rawTimeout}" (expected a positive integer)`,
    );
  }

  return { port, host, timeoutMs };
}

// Same listener-detection rules as the agent's src/utils/port.ts: Windows
// reports listeners on the port regardless of interface (0.0.0.0, [::], a
// specific NIC address) with the foreign address ending in ":0". Established
// and TIME_WAIT rows have a real foreign port and are ignored, so restarts on
// a port with lingering connections are not flagged as conflicts.
function findListeningPids(netstatOutput, port) {
  const portSuffix = `:${port}`;
  const pids = new Set();
  for (const line of netstatOutput.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5) continue;
    const protocol = String(columns[0] || "").toUpperCase();
    if (protocol !== "TCP" && protocol !== "TCPV6") continue;
    const localAddress = columns[1] || "";
    const foreignAddress = columns[2] || "";
    if (!localAddress.endsWith(portSuffix)) continue;
    if (!foreignAddress.endsWith(":0")) continue;
    const pid = Number(columns[4]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    pids.add(pid);
  }
  return [...pids];
}

function parseTasklistImageName(tasklistOutput) {
  return tasklistOutput.match(/^"([^"]+)"/m)?.[1];
}

// Returns the PIDs listening on the port, or undefined when the OS listener
// table is unavailable (non-Windows, command failure) so main() can fall back
// to the bind error reported by the server.
function findListeningPidsOnHost(port) {
  if (process.platform !== "win32") return undefined;
  try {
    const output = execFileSync(NETSTAT_COMMAND, ["-ano"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return findListeningPids(output, port);
  } catch {
    return undefined;
  }
}

function findProcessName(pid) {
  if (process.platform !== "win32") return undefined;
  try {
    const output = execFileSync(
      TASKLIST_COMMAND,
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    return parseTasklistImageName(output);
  } catch {
    return undefined;
  }
}

function formatPortInUseError(port, pid, processName) {
  if (pid === undefined) {
    return `port ${port} is already in use — stop the process using it or set a different EXPORTER_PORT`;
  }
  const owner = processName ? `PID ${pid} (${processName})` : `PID ${pid}`;
  return `port ${port} is already in use by ${owner} — stop that process or set a different EXPORTER_PORT`;
}

// Throws when a listener already owns the port. The check is skipped when the
// OS listener table is unavailable; binding still fails safely in that case.
function assertPortAvailable(port) {
  const pids = findListeningPidsOnHost(port);
  if (pids === undefined || pids.length === 0) return;
  const [pid] = pids;
  const processName = pid === undefined ? undefined : findProcessName(pid);
  throw new Error(formatPortInUseError(port, pid, processName));
}

// Callback-style pm2.list -> Promise, bounded by a timeout. When the PM2
// daemon is gone, pm2.list may never call back at all, so without this the
// scrape request would hang forever instead of reporting a clean 503.
function pm2List(pm2, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`PM2 daemon did not respond within ${timeoutMs}ms`));
    }, timeoutMs);

    pm2.list((err, list) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) return reject(err);
      return resolve(list || []);
    });
  });
}

async function collect({
  pm2,
  now = Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const list = await pm2List(pm2, timeoutMs);
  return render(buildSamples(list, now));
}

function createRequestHandler({
  pm2,
  log = console,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  return function handler(req, res) {
    const path = String(req.url || "").split("?")[0];

    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<html><body>PM2 metrics: <a href="/metrics">/metrics</a></body></html>',
      );
      return;
    }

    if (req.method === "GET" && path === "/metrics") {
      Promise.resolve()
        .then(() => collect({ pm2, now: now(), timeoutMs }))
        .then((body) => {
          res.writeHead(200, { "Content-Type": CONTENT_TYPE });
          res.end(body);
        })
        .catch((err) => {
          log.error(
            `[xpm-exporter] PM2 unreachable: ${(err && err.message) || err}`,
          );
          res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("# PM2 unreachable; see xpm-exporter logs\n");
        });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  };
}

function createServer(options) {
  return http.createServer(createRequestHandler(options));
}

function main() {
  if (fs.existsSync(ENV_FILE)) {
    try {
      process.loadEnvFile(ENV_FILE);
    } catch (err) {
      console.error(`[xpm-exporter] failed to load ${ENV_FILE}: ${err.message}`);
      process.exit(2);
    }
  }

  let config;
  try {
    config = parseConfig(process.env);
  } catch (err) {
    console.error(`[xpm-exporter] ${err.message}`);
    process.exit(2);
  }

  try {
    assertPortAvailable(config.port);
  } catch (err) {
    console.error(`[xpm-exporter] ${err.message}`);
    process.exit(2);
  }

  const pm2 = require("pm2");
  const server = createServer({ pm2, timeoutMs: config.timeoutMs });

  server.on("error", (err) => {
    console.error(
      `[xpm-exporter] failed to bind ${config.host}:${config.port}: ${err.message}`,
    );
    process.exit(2);
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[xpm-exporter] listening at http://${config.host}:${config.port}/metrics`,
    );
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  ENV_FILE,
  PREFIX,
  LABEL_NAMES,
  METRICS,
  STATUS_CODES,
  DEFAULT_NAMESPACE,
  DEFAULT_TIMEOUT_MS,
  toNumber,
  statusCode,
  getSeverityRank,
  escapeLabel,
  renderLabelSet,
  buildSamples,
  render,
  parseConfig,
  findListeningPids,
  parseTasklistImageName,
  formatPortInUseError,
  pm2List,
  collect,
  createRequestHandler,
  createServer,
  main,
};
