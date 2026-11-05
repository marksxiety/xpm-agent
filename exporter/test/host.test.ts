import { test, expect } from "bun:test";
import { getHostMetrics, toPercent } from "../src/host";
import { makeHost } from "./support/make-host";

test("getHostMetrics returns clamped CPU, core count, and memory values", async () => {
  const metrics = await getHostMetrics(
    makeHost({ cpu: 33.333, cores: 8, total: 8_000, used: 2_000 }),
  );

  expect(metrics.cpuUsagePercent).toBe(33.33);
  expect(metrics.cpuCores).toBe(8);
  expect(metrics.memoryUsagePercent).toBe(25);
  expect(metrics.memoryTotalBytes).toBe(8_000);
});

test("getHostMetrics clamps out-of-range values", async () => {
  const metrics = await getHostMetrics(makeHost({ cpu: -4, total: 1_000, used: 1_500 }));

  expect(metrics.cpuUsagePercent).toBe(0);
  expect(metrics.memoryUsagePercent).toBe(100);
});

test("memory percentage is 0 when the total is unusable", async () => {
  const metrics = await getHostMetrics(makeHost({ total: 0, used: 500 }));

  expect(metrics.memoryUsagePercent).toBe(0);
  expect(toPercent(500, 0)).toBe(0);
});

test("non-finite inputs do not produce NaN", async () => {
  const metrics = await getHostMetrics(makeHost({ cpu: Number.NaN, total: Number.NaN, used: 10 }));

  expect(Number.isFinite(metrics.cpuUsagePercent)).toBe(true);
  expect(Number.isFinite(metrics.memoryUsagePercent)).toBe(true);
});
