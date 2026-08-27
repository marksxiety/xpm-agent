import type { OpenAPIV3 } from "openapi-types";

export const HostMetrics: OpenAPIV3.SchemaObject = {
  type: "object",
  description: "Host-level (OS) metrics.",
  required: ["cpu", "memory"],
  properties: {
    cpu: {
      type: "object",
      required: ["cores", "model", "loadAvg"],
      properties: {
        cores: { type: "number", description: "Number of logical CPU cores" },
        model: { type: "string", description: "CPU model name" },
        loadAvg: { type: "array", items: { type: "number" }, description: "1, 5, and 15-minute load averages" },
      },
    },
    memory: {
      type: "object",
      required: ["totalBytes", "freeBytes", "usedBytes", "percentUsed"],
      properties: {
        totalBytes: { type: "number", description: "Total system memory in bytes" },
        freeBytes: { type: "number", description: "Free system memory in bytes" },
        usedBytes: { type: "number", description: "Used system memory in bytes (total - free)" },
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
    uptime: { type: "number", description: "Epoch timestamp (ms) of last start" },
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