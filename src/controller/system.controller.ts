import os from "node:os";
import type { ApiResponse, SystemOverview, SystemOverviewWithProcesses } from "../types";
import { respond } from "../utils/response";
import { getCurrentTimeStamp } from "../utils/datetime";
import { processController, type ProcessController } from "./process.controller";

type OsModule = Pick<typeof os, "totalmem" | "freemem" | "cpus" | "loadavg">;

export class SystemController {
  constructor(
    private processController: ProcessController,
    private osModule: OsModule = os,
  ) {}

  private getHostMetrics = (): SystemOverview => {
    const totalBytes = this.osModule.totalmem();
    const freeBytes = this.osModule.freemem();
    const usedBytes = totalBytes - freeBytes;
    const cpus = this.osModule.cpus();

    return {
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model ?? "Unknown",
        loadAvg: this.osModule.loadavg(),
      },
      memory: {
        totalBytes,
        freeBytes,
        usedBytes,
        percentUsed: Number(((usedBytes / totalBytes) * 100).toFixed(2)),
      },
    };
  }

  getHostOverview = (): ApiResponse<{ host: SystemOverview }> =>
    respond("System overview retrieved successfully", { host: this.getHostMetrics() });

  getProcessOverview = async (tail?: number): Promise<ApiResponse<SystemOverviewWithProcesses>> => {
    const listResponse = await this.processController.listProcesses(tail);
    if (!listResponse.success || !listResponse.info) {
      return listResponse as unknown as ApiResponse<SystemOverviewWithProcesses>;
    }

    return respond("PM2 process list retrieved successfully", {
      overview: this.getHostMetrics(),
      processes: listResponse.info,
    });
  };

  healthCheck = (): ApiResponse<{ status: string; uptime: number; timestamp: number }> =>
    respond("PM2 health check passed", {
      status: "ok",
      uptime: process.uptime(),
      timestamp: getCurrentTimeStamp(),
    });
}

export const systemController = new SystemController(processController);