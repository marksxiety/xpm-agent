import { cpus } from "node:os";
import { currentLoad, mem } from "systeminformation";

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

export type HostMetrics = {
  cpuUsagePercent: number;
  cpuCores: number;
  memoryUsagePercent: number;
  memoryTotalBytes: number;
};

const clampPercent = (value: number): number =>
  Number.isFinite(value)
    ? Number(Math.min(100, Math.max(0, value)).toFixed(2))
    : 0;

export function toPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return clampPercent((part / total) * 100);
}

export async function getHostMetrics(
  source: HostMetricsSource = systemInformationSource,
): Promise<HostMetrics> {
  const [load, memory] = await Promise.all([source.currentLoad(), source.mem()]);
  const cores = source.cores();

  return {
    cpuUsagePercent: clampPercent(load.currentLoad),
    cpuCores: Number.isFinite(cores) ? Math.max(0, Math.trunc(cores)) : 0,
    memoryUsagePercent: toPercent(memory.used, memory.total),
    memoryTotalBytes: Number.isFinite(memory.total) ? Math.max(0, memory.total) : 0,
  };
}
