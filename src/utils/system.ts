import { currentLoad, mem } from "systeminformation";
import type { SystemOverview } from "../types";

export interface HostMetricsSource {
  currentLoad(): Promise<{ currentLoad: number }>;
  mem(): Promise<{ total: number; used: number; free: number }>;
}

export const systemInformationSource: HostMetricsSource = { currentLoad, mem };

const clampPercent = (value: number): number => Number(Math.min(100, Math.max(0, value)).toFixed(2));

export function toPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return clampPercent((part / total) * 100);
}

export async function getHostMetrics(source: HostMetricsSource = systemInformationSource): Promise<SystemOverview> {
  const [load, memory] = await Promise.all([source.currentLoad(), source.mem()]);

  return {
    cpu: {
      usagePercent: clampPercent(load.currentLoad),
    },
    memory: {
      totalBytes: memory.total,
      freeBytes: memory.free,
      usedBytes: memory.used,
      percentUsed: toPercent(memory.used, memory.total),
    },
  };
}
