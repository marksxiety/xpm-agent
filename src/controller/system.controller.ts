import type { AgentStatusResponse, ApiResponse, SystemOverview } from "../types";
import { respond } from "../utils/response";
import { getCurrentTimeStamp } from "../utils/datetime";
import { getHostMetrics, hostMetricsSampler, type HostMetricsProvider } from "../utils/system";
import { logMetricsSource, type LogMetricsSource } from "../utils/log";

export class SystemController {
  constructor(
    private hostMetrics: HostMetricsProvider = hostMetricsSampler,
    private logSource: LogMetricsSource = logMetricsSource,
  ) {}

  getHostOverview = async (): Promise<ApiResponse<{ host: SystemOverview }>> =>
    respond("System overview retrieved successfully", {
      host: await getHostMetrics(this.hostMetrics, this.logSource),
    });

  // Public liveness banner — returned verbatim (no `status` field), so it
  // must not go through `respond()`, only `pm2Routes` strips `status`.
  getRootStatus = (): AgentStatusResponse => ({
    success: true,
    message: "XPM agent is running",
    info: { pid: process.pid },
  });

  healthCheck = (): ApiResponse<{ status: string; uptime: number; timestamp: number }> =>
    respond("PM2 health check passed", {
      status: "ok",
      uptime: process.uptime(),
      timestamp: getCurrentTimeStamp(),
    });
}

export const systemController = new SystemController();
