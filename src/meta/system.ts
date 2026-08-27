import { HostOverviewResponse } from "./schemas";

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
        "Host-level metrics only (CPU cores, model, load average, memory usage). Does not include the process list — use GET /list?overview=true for a combined host + processes view.",
      tags: ["System"],
      operationId: "getHostOverview",
      responses: {
        200: {
          description: "Host-level metrics only.",
          content: {
            "application/json": {
              schema: HostOverviewResponse,
              example: {
                success: true,
                message: "System overview retrieved successfully",
                info: {
                  host: {
                    cpu: {
                      cores: 8,
                      model: "Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz",
                      loadAvg: [0.42, 0.35, 0.29],
                    },
                    memory: {
                      totalBytes: 17179869184,
                      freeBytes: 6012954214,
                      usedBytes: 11166914970,
                      percentUsed: 65,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const getSystemRouteMeta = <K extends keyof typeof systemRouteMeta>(key: K) => systemRouteMeta[key];