export const PREFIX = "pm2";
export const LABEL_NAMES = ["name", "namespace"] as const;
export const DEFAULT_NAMESPACE = "default";
export const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

// [suffix, help, type]. All prefixed with `pm2_` to match the original.
// Exactly one series per process per entry, labelled name/namespace, plus
// unique_id on the colliding series when two live processes share both.
export const METRICS: ReadonlyArray<readonly [string, string, string]> = [
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
export const STATUS_CODES: Readonly<Record<string, number>> = Object.freeze({
  online: 1,
  launching: 2,
  stopping: 3,
  "waiting restart": 4,
  stopped: 5,
  errored: 6,
  "one-launch-status": 7,
});

export type SeverityEnvironment = {
  status?: unknown;
  autorestart?: unknown;
  exit_code?: unknown;
};

export type ProcessMonit = {
  cpu?: unknown;
  memory?: unknown;
};

export type ProcessEnvironment = {
  status?: unknown;
  namespace?: unknown;
  pm_uptime?: unknown;
  restart_time?: unknown;
  unstable_restarts?: unknown;
  unique_id?: unknown;
};

// The subset of a PM2 process entry this exporter reads. Fields are `unknown`
// on purpose: PM2's payload is broader than its type definitions, and the
// formatters below coerce values defensively.
export type Pm2ProcessInput = {
  name?: unknown;
  pm_id?: unknown;
  monit?: ProcessMonit;
  pm2_env?: ProcessEnvironment;
};

export type MetricSample = {
  name: string;
  help: string;
  type: string;
  labels: Record<string, string>;
  value: number;
};

export function statusCode(status: unknown): number {
  const code = STATUS_CODES[String(status)];
  return code === undefined ? 0 : code;
}

// Lower is worse; 6 is "healthy or idle". Unknown statuses deliberately fall
// through to 5 so they surface as unhealthy rather than being treated as fine.
export function getSeverityRank(env: SeverityEnvironment): number {
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

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function escapeLabel(value: unknown): string {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

export function renderLabelSet(labels?: Record<string, string>): string {
  if (!labels) return "";
  const keys = Object.keys(labels);
  if (keys.length === 0) return "";
  const body = keys
    .map((key) => `${key}="${escapeLabel(labels[key])}"`)
    .join(",");
  return `{${body}}`;
}

// Pure: PM2 list entries -> one sample per (metric, process).
export function buildSamples(
  list: readonly Pm2ProcessInput[] | null | undefined,
  now = Date.now(),
): MetricSample[] {
  const samples: MetricSample[] = [];
  const processes = list || [];

  // Series identity is (metric, name, namespace): stable across restarts and
  // across delete + re-create of the same app, unlike pm_id (a daemon slot that
  // can move between processes). Two live processes sharing a name/namespace
  // would collide, so those get PM2's per-process unique_id added (pm_id as a
  // last resort), keeping the scrape valid.
  const nameCounts = new Map<string, number>();
  for (const proc of processes) {
    const env = proc.pm2_env || {};
    const key = `${String(proc.name)}\0${String(env.namespace || DEFAULT_NAMESPACE)}`;
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  for (const proc of processes) {
    const env = proc.pm2_env || {};
    const monit = proc.monit || {};
    const online = env.status === "online";

    const name = String(proc.name);
    const namespace = String(env.namespace || DEFAULT_NAMESPACE);
    const labels: Record<string, string> = { name, namespace };
    if ((nameCounts.get(`${name}\0${namespace}`) || 0) > 1) {
      labels.unique_id = String(env.unique_id || proc.pm_id);
    }

    const startedAtMs = toNumber(env.pm_uptime);
    const uptime =
      online && startedAtMs > 0
        ? Math.max(0, Math.round((now - startedAtMs) / 1000))
        : 0;
    const startTimeSeconds = startedAtMs / 1000;

    const values: Record<string, number> = {
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
export function render(
  samples: readonly MetricSample[] | null | undefined,
): string {
  const ordered = [...(samples || [])].sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    const la = renderLabelSet(a.labels);
    const lb = renderLabelSet(b.labels);
    if (la !== lb) return la < lb ? -1 : 1;
    return 0;
  });

  const lines: string[] = [];
  const declared = new Set<string>();
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
