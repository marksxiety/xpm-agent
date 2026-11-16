import { describe, expect, test } from "bun:test";
import {
  HostMetricsSampler,
  readHostUsage,
  toPercent,
  type HostMetricsSource,
} from "../../utils/system";

function buildSource(overrides: Partial<HostMetricsSource> = {}): HostMetricsSource {
  return {
    currentLoad: async () => ({ currentLoad: 12.5 }),
    mem: async () => ({ total: 1000, used: 600, free: 400 }),
    cores: () => 8,
    ...overrides,
  };
}

describe("toPercent", () => {
  test("returns the percentage of part over total rounded to two decimals", () => {
    expect(toPercent(1, 3)).toBe(33.33);
    expect(toPercent(600, 1000)).toBe(60);
  });

  test("returns 0 when total is zero or negative", () => {
    expect(toPercent(10, 0)).toBe(0);
    expect(toPercent(10, -5)).toBe(0);
  });

  test("caps the result at 100", () => {
    expect(toPercent(200, 100)).toBe(100);
  });
});

describe("readHostUsage", () => {
  test("maps cpu usage and memory fields", async () => {
    const usage = await readHostUsage(buildSource());

    expect(usage.cpu.usagePercent).toBe(12.5);
    expect(usage.cpu.cores).toBe(8);
    expect(usage.memory).toEqual({
      totalBytes: 1000,
      freeBytes: 400,
      usedBytes: 600,
      percentUsed: 60,
    });
  });

  test("rounds cpu usage to two decimals", async () => {
    const usage = await readHostUsage(
      buildSource({ currentLoad: async () => ({ currentLoad: 33.333 }) }),
    );

    expect(usage.cpu.usagePercent).toBe(33.33);
  });

  test("clamps cpu usage into the 0-100 range", async () => {
    const high = await readHostUsage(
      buildSource({ currentLoad: async () => ({ currentLoad: 155.5 }) }),
    );
    const low = await readHostUsage(
      buildSource({ currentLoad: async () => ({ currentLoad: -4 }) }),
    );

    expect(high.cpu.usagePercent).toBe(100);
    expect(low.cpu.usagePercent).toBe(0);
  });
});

describe("HostMetricsSampler", () => {
  test("discards the first CPU reading and measures an explicit window", async () => {
    let calls = 0;
    let clock = 1_000;
    const source = buildSource({
      currentLoad: async () => {
        calls += 1;
        return { currentLoad: calls === 1 ? 99 : 12.5 };
      },
    });
    const sampler = new HostMetricsSampler(source, {
      intervalMs: 60_000,
      warmupMs: 5,
      now: () => {
        clock += 10;
        return clock;
      },
      sleep: async () => undefined,
    });

    const snapshot = await sampler.snapshot();
    sampler.stop();

    expect(calls).toBe(2);
    expect(snapshot.cpu.usagePercent).toBe(12.5);
    expect(snapshot.cpu.cores).toBe(8);
    expect(snapshot.memory.percentUsed).toBe(60);
    expect(snapshot.sampledAt).toBe(1020);
    expect(snapshot.cpuWindowMs).toBe(10);
  });

  test("serves the cached sample without calling the source again", async () => {
    let calls = 0;
    const source = buildSource({
      currentLoad: async () => {
        calls += 1;
        return { currentLoad: 12.5 };
      },
    });
    const sampler = new HostMetricsSampler(source, {
      intervalMs: 60_000,
      warmupMs: 1,
      sleep: async () => undefined,
    });

    const first = await sampler.snapshot();
    const second = await sampler.snapshot();
    sampler.stop();

    expect(calls).toBe(2);
    expect(second).toBe(first);
  });

  test("clamps an out-of-range CPU reading", async () => {
    let calls = 0;
    const sampler = new HostMetricsSampler(
      buildSource({
        currentLoad: async () => {
          calls += 1;
          return { currentLoad: calls === 1 ? 0 : 155.5 };
        },
      }),
      { intervalMs: 60_000, warmupMs: 1, sleep: async () => undefined },
    );

    const snapshot = await sampler.snapshot();
    sampler.stop();

    expect(snapshot.cpu.usagePercent).toBe(100);
  });
});
