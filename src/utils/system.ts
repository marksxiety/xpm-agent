import { cpus } from "node:os";
import { currentLoad, mem } from "systeminformation";
import type { SystemOverview } from "../types";
import { logMetricsSource, type LogMetricsSource } from "./log";

export interface HostMetricsSource {
  currentLoad(): Promise<{ currentLoad: number }>;
  mem(): Promise<{ total: number; used: number; free: number }>;
  cores(): number;
}

export const systemInformationSource: HostMetricsSource = {
  currentLoad,
  mem,
  cores: () => cpus().length,
};

const clampPercent = (value: number): number => Number(Math.min(100, Math.max(0, value)).toFixed(2));

export function toPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return clampPercent((part / total) * 100);
}

export async function getHostMetrics(
  source: HostMetricsSource = systemInformationSource,
  logSource: LogMetricsSource = logMetricsSource,
): Promise<SystemOverview> {
  const [load, memory, logs] = await Promise.all([source.currentLoad(), source.mem(), logSource.logDirMetrics()]);

  return {
    cpu: {
      usagePercent: clampPercent(load.currentLoad),
      cores: source.cores(),
    },
    memory: {
      totalBytes: memory.total,
      freeBytes: memory.free,
      usedBytes: memory.used,
      percentUsed: toPercent(memory.used, memory.total),
    },
    logs,
  };
}
