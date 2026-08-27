import os from "node:os";
import type { ApiResponse, SystemOverview } from "../types";
import { respond } from "../utils/response";
import { getCurrentTimeStamp } from "../utils/datetime";
import { getHostMetrics, type OsModule } from "../utils/system";

export class SystemController {
  constructor(private osModule: OsModule = os) {}

  getHostOverview = (): ApiResponse<{ host: SystemOverview }> =>
    respond("System overview retrieved successfully", { host: getHostMetrics(this.osModule) });

  healthCheck = (): ApiResponse<{ status: string; uptime: number; timestamp: number }> =>
    respond("PM2 health check passed", {
      status: "ok",
      uptime: process.uptime(),
      timestamp: getCurrentTimeStamp(),
    });
}

export const systemController = new SystemController();
