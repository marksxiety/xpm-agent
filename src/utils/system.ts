import os from "node:os";
import type { SystemOverview } from "../types";

export type OsModule = Pick<typeof os, "totalmem" | "freemem" | "cpus" | "loadavg">;

export function getHostMetrics(osModule: OsModule): SystemOverview {
  const totalBytes = osModule.totalmem();
  const freeBytes = osModule.freemem();
  const usedBytes = totalBytes - freeBytes;
  const cpus = osModule.cpus();

  return {
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model ?? "Unknown",
      loadAvg: osModule.loadavg(),
    },
    memory: {
      totalBytes,
      freeBytes,
      usedBytes,
      percentUsed: Number(((usedBytes / totalBytes) * 100).toFixed(2)),
    },
  };
}
