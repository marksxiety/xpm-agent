import { describe, expect, test } from "bun:test";
import { getHostMetrics, toPercent, type HostMetricsSource } from "../../utils/system";

function buildSource(overrides: Partial<HostMetricsSource> = {}): HostMetricsSource {
  return {
    currentLoad: async () => ({ currentLoad: 12.5 }),
    mem: async () => ({ total: 1000, used: 600, free: 400 }),
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

describe("getHostMetrics", () => {
  test("maps cpu usage and memory fields", async () => {
    const metrics = await getHostMetrics(buildSource());

    expect(metrics.cpu.usagePercent).toBe(12.5);
    expect(metrics.memory).toEqual({
      totalBytes: 1000,
      freeBytes: 400,
      usedBytes: 600,
      percentUsed: 60,
    });
  });

  test("rounds cpu usage to two decimals", async () => {
    const metrics = await getHostMetrics(buildSource({ currentLoad: async () => ({ currentLoad: 33.333 }) }));

    expect(metrics.cpu.usagePercent).toBe(33.33);
  });

  test("clamps cpu usage into the 0-100 range", async () => {
    const high = await getHostMetrics(buildSource({ currentLoad: async () => ({ currentLoad: 155.5 }) }));
    const low = await getHostMetrics(buildSource({ currentLoad: async () => ({ currentLoad: -4 }) }));

    expect(high.cpu.usagePercent).toBe(100);
    expect(low.cpu.usagePercent).toBe(0);
  });
});
