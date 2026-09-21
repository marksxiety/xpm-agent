import type { OpenAPIV3 } from "openapi-types";

export const HostMetrics: OpenAPIV3.SchemaObject = {
  type: "object",
  description: "Host-level (OS) metrics.",
  required: ["cpu", "memory"],
  properties: {
    cpu: {
      type: "object",
      required: ["usagePercent"],
      properties: {
        usagePercent: { type: "number", description: "CPU utilization percentage (0-100, 2 decimal places)" },
      },
    },
    memory: {
      type: "object",
      required: ["totalBytes", "freeBytes", "usedBytes", "percentUsed"],
      properties: {
        totalBytes: { type: "number", description: "Total system memory in bytes" },
        freeBytes: { type: "number", description: "Free system memory in bytes" },
        usedBytes: { type: "number", description: "Used system memory in bytes, including buffers/cache" },
        percentUsed: { type: "number", description: "Used memory as a percentage (0-100, 2 decimal places)" },
      },
    },
  },
};

export const ProcessSummary: OpenAPIV3.SchemaObject = {
  type: "object",
  description: "Summary of a single PM2-managed process.",
  properties: {
    pid: { type: "number", description: "OS process id (0 if not running)" },
    pm_id: { type: "number", description: "PM2 internal id — used in `:id` routes" },
    name: { type: "string", description: "Process name" },
    namespace: { type: "string", description: "PM2 namespace (default: 'default')" },
    status: { type: "string", description: "online, stopped, stopping, launching, errored, ..." },
    uptime: { type: "number", description: "Elapsed time (ms) since the process last started; 0 when not online" },
    restarts: { type: "number", description: "Total restart count" },
    unstable_restarts: { type: "number", description: "Consecutive unstable restarts" },
    exec_mode: { type: "string", description: "fork_mode or cluster_mode" },
    instances: { type: "number", description: "Instance count (cluster mode)" },
    interpreter: { type: "string", description: "Absolute interpreter path, or 'none'" },
    cpu: { type: "number", description: "Current CPU usage (%)" },
    memory: { type: "number", description: "Current memory usage (bytes)" },
    cwd: { type: "string", description: "Working directory" },
    ip_address: { type: "string", description: "Server IPv4 address the process runs on" },
    watch: { type: "boolean", description: "File-watch enabled" },
    autorestart: { type: "boolean", description: "Auto-restart on crash enabled" },
    logs: {
      type: "object",
      description: "Only present when `?logs=N` is passed",
      properties: {
        out: { type: "array", items: { type: "string" }, description: "Trailing lines of the stdout log" },
        error: { type: "array", items: { type: "string" }, description: "Trailing lines of the stderr log" },
      },
    },
  },
};

export const ProcessListResponse: OpenAPIV3.SchemaObject = {
  type: "object",
  required: ["success", "message", "info"],
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
    info: { type: "array", items: ProcessSummary },
  },
};

export const ProcessMetrics: OpenAPIV3.SchemaObject = {
  type: "object",
  additionalProperties: true,
  description:
    "Raw `pm2_env.axm_monitor` entries (pmx code metrics) passed through verbatim. Keys are metric names (e.g. \"Heap Size\"); values are whatever pmx reports (typically `{ value, unit }`). Empty `{}` for processes without pmx instrumentation (e.g. Python, Go, binaries).",
};

export const ProcessDescribeDetails: OpenAPIV3.SchemaObject = {
  type: "object",
  description:
    "Process-table fields mirroring `pm2 describe`. Non-conditional keys are always present (`null` when PM2 reports no value); `entire_log_path`, `cron_restart`, and `max_memory_restart` are included only when configured.",
  properties: {
    version: { type: "string", nullable: true, description: "App version as recorded by PM2" },
    script_path: { type: "string", nullable: true, description: "Resolved path of the launched script (`pm_exec_path`)" },
    script_args: {
      nullable: true,
      description: "Raw arguments passed to the script (`pm2_env.args`)",
      oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    },
    error_log_path: { type: "string", nullable: true, description: "stderr log file path" },
    out_log_path: { type: "string", nullable: true, description: "stdout log file path" },
    pid_path: { type: "string", nullable: true, description: "PID file path" },
    interpreter_args: {
      type: "array",
      items: { type: "string" },
      nullable: true,
      description: "Interpreter arguments (`pm2_env.node_args`); `null` when empty",
    },
    node_version: { type: "string", nullable: true, description: "Node/Bun-reported runtime version; `null` for non-Node/Bun interpreters" },
    node_env: { type: "string", nullable: true, description: "`NODE_ENV` from the process environment; `null` when unset" },
    created_at: { type: "string", format: "date-time", nullable: true, description: "Process creation time (ISO 8601); `null` when unavailable" },
    entire_log_path: { type: "string", description: "Combined log path — only present when configured" },
    cron_restart: { type: "string", description: "Cron restart expression — only present when configured" },
    max_memory_restart: {
      description: "Max-memory restart threshold — only present when configured",
      oneOf: [{ type: "number" }, { type: "string" }],
    },
  },
};

export const ProcessDescriptionDetails: OpenAPIV3.SchemaObject = {
  type: "object",
  description: "Single-process detail payload returned by `GET /describe/:id`.",
  required: ["summary", "describe", "metrics"],
  properties: {
    summary: ProcessSummary,
    describe: ProcessDescribeDetails,
    metrics: ProcessMetrics,
  },
};

export const DescribeResponse: OpenAPIV3.SchemaObject = {
  type: "object",
  required: ["success", "message", "info"],
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
    info: ProcessDescriptionDetails,
  },
};

export const ProcessOverviewResponse: OpenAPIV3.SchemaObject = {
  type: "object",
  required: ["success", "message", "info"],
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
    info: {
      type: "object",
      required: ["overview", "processes"],
      properties: {
        overview: HostMetrics,
        processes: { type: "array", items: ProcessSummary },
      },
    },
  },
};

export const HostOverviewResponse: OpenAPIV3.SchemaObject = {
  type: "object",
  required: ["success", "message", "info"],
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
    info: {
      type: "object",
      required: ["host"],
      properties: {
        host: HostMetrics,
      },
    },
  },
};