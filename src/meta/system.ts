import { AgentStatusResponse, HostOverviewResponse } from "./schemas";

const systemRouteMeta = {
  root: {
    detail: {
      summary: "Agent liveness banner",
      description:
        "Root endpoint confirming the agent process is up and reporting its OS process id. Public — no `AUTH_TOKEN` required, unlike the `/pm2/*` routes.",
      tags: ["System"],
      operationId: "getAgentStatus",
      responses: {
        200: {
          description: "Agent status with its process id.",
          content: {
            "application/json": {
              schema: AgentStatusResponse,
              example: {
                success: true,
                message: "XPM agent is running",
                info: {
                  pid: 12345,
                },
              },
            },
          },
        },
      },
    },
  },
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
        "Host-level metrics only (CPU utilization percentage, memory usage, and the PM2 log-directory footprint). Does not include the process list — use GET /list?overview=true for a combined host + processes view.",
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
                      usagePercent: 12.5,
                      cores: 8,
                    },
                    memory: {
                      totalBytes: 17179869184,
                      freeBytes: 6012954214,
                      usedBytes: 11166914970,
                      percentUsed: 65,
                    },
                    logs: {
                      totalBytes: 48234496,
                      fileCount: 128,
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