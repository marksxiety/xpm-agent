const systemRouteMeta = {
  health: {
    detail: {
      summary: "API health check",
      description:
        "Liveness check for this API server itself (not the PM2 processes). Useful for uptime monitoring and load balancer probes.",
      tags: ["System"],
      operationId: "healthCheck",
    },
  },
  overview: {
    detail: {
      summary: "System overview",
      description:
        "Host-level metrics (CPU cores, model, load average, memory usage) combined with a summary of all PM2-managed processes. Useful for a single-page dashboard of the machine and what it is running.",
      tags: ["System"],
      operationId: "getSystemOverview",
    },
  },
};

export const getSystemRouteMeta = <K extends keyof typeof systemRouteMeta>(key: K) => systemRouteMeta[key];