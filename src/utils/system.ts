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

export interface HostUsage {
  cpu: {
    usagePercent: number;
    cores: number;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    percentUsed: number;
  };
}

export interface HostUsageSnapshot extends HostUsage {
  /** Unix timestamp (ms) when the host metrics were sampled. */
  sampledAt: number;
  /** Length of the CPU measurement window in milliseconds. */
  cpuWindowMs: number;
}

export interface HostMetricsProvider {
  snapshot(): Promise<HostUsageSnapshot>;
}

/** PM2's own worker refreshes process metrics every 30s; 5s keeps the host view current. */
const DEFAULT_SAMPLE_INTERVAL_MS = 5_000;
/** systeminformation only recomputes `currentLoad` after ~200ms. */
const DEFAULT_WARMUP_MS = 250;

const clampPercent = (value: number): number =>
  Number.isFinite(value)
    ? Number(Math.min(100, Math.max(0, value)).toFixed(2))
    : 0;

const safeCores = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

export function toPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return clampPercent((part / total) * 100);
}

const toBytes = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

function toMemoryUsage(memory: { total: number; used: number; free: number }): HostUsage["memory"] {
  return {
    totalBytes: toBytes(memory.total),
    freeBytes: toBytes(memory.free),
    usedBytes: toBytes(memory.used),
    percentUsed: toPercent(memory.used, memory.total),
  };
}

/**
 * Reads one host sample without owning a measurement window. Used by the
 * sampler below and by unit tests; the sampler is what callers should use.
 */
export async function readHostUsage(source: HostMetricsSource): Promise<HostUsage> {
  const [load, memory] = await Promise.all([source.currentLoad(), source.mem()]);

  return {
    cpu: {
      usagePercent: clampPercent(load.currentLoad),
      cores: safeCores(source.cores()),
    },
    memory: toMemoryUsage(memory),
  };
}

export interface HostMetricsSamplerOptions {
  intervalMs?: number;
  warmupMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Owns the host CPU measurement window so every caller sees one cached,
 * timestamped sample instead of an implicit "time since this request"
 * average (systeminformation.currentLoad is stateful per process).
 */
export class HostMetricsSampler implements HostMetricsProvider {
  private readonly source: HostMetricsSource;
  private readonly intervalMs: number;
  private readonly warmupMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private current: HostUsageSnapshot | null = null;
  private ready: Promise<HostUsageSnapshot> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousSampleAt: number | null = null;

  constructor(
    source: HostMetricsSource = systemInformationSource,
    options: HostMetricsSamplerOptions = {},
  ) {
    this.source = source;
    this.intervalMs = options.intervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
    this.warmupMs = options.warmupMs ?? DEFAULT_WARMUP_MS;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  snapshot(): Promise<HostUsageSnapshot> {
    if (this.current !== null) return Promise.resolve(this.current);
    if (this.ready === null) {
      this.ready = this.warmUp().finally(() => {
        this.ready = null;
      });
    }
    return this.ready;
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async warmUp(): Promise<HostUsageSnapshot> {
    // The first currentLoad() call returns the average since the agent
    // process started. Discard it and measure a short, explicit window.
    await this.source.currentLoad();
    this.previousSampleAt = this.now();
    await this.sleep(this.warmupMs);
    const snapshot = await this.measure();
    this.start();
    return snapshot;
  }

  private async measure(): Promise<HostUsageSnapshot> {
    const usage = await readHostUsage(this.source);
    const sampledAt = this.now();
    const cpuWindowMs =
      this.previousSampleAt === null
        ? this.warmupMs
        : Math.max(0, sampledAt - this.previousSampleAt);

    this.previousSampleAt = sampledAt;
    this.current = { ...usage, sampledAt, cpuWindowMs };

    return this.current;
  }

  private start(): void {
    if (this.timer !== null) return;
    let inFlight = false;
    this.timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void this.measure()
        .catch((error) => {
          // Keep serving the last good sample; surface the failure in the logs.
          console.error("host-metrics sampler: failed to refresh host metrics", error);
        })
        .finally(() => {
          inFlight = false;
        });
    }, this.intervalMs);
    (this.timer as { unref?: () => void }).unref?.();
  }
}

export const hostMetricsSampler = new HostMetricsSampler(systemInformationSource);

/**
 * Reads the shared host snapshot and merges the (slower-moving) PM2 log
 * footprint. Both `/pm2/system` and `/pm2/list?overview=true` use this so the
 * CPU/memory values they report come from the same sample.
 */
export async function getHostMetrics(
  provider: HostMetricsProvider = hostMetricsSampler,
  logSource: LogMetricsSource = logMetricsSource,
): Promise<SystemOverview> {
  const [usage, logs] = await Promise.all([
    provider.snapshot(),
    logSource.logDirMetrics(),
  ]);

  return {
    cpu: {
      usagePercent: usage.cpu.usagePercent,
      cores: usage.cpu.cores,
      windowMs: usage.cpuWindowMs,
    },
    memory: usage.memory,
    logs,
    sampledAt: usage.sampledAt,
  };
}

/**
 * Starts the background sampler without awaiting it. Called at process start
 * so the first overview request does not pay the warm-up window.
 */
export function warmUpHostMetrics(): void {
  void hostMetricsSampler.snapshot().catch((error) => {
    console.error("host-metrics sampler: warm-up failed", error);
  });
}
