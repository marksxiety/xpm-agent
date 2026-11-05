import { test, expect, mock } from "bun:test";
import { collect, pm2List, type Pm2ListAdapter } from "../src/pm2";
import type { HostMetricsSource } from "../src/host";
import { makeProc } from "./support/make-proc";
import { makeHost } from "./support/make-host";

test("collect uses the injected pm2 adapter", async () => {
  const pm2: Pm2ListAdapter = {
    list: (callback) => callback(null, [makeProc({ name: "injected" })]),
  };
  const body = await collect({ pm2, host: makeHost(), now: 5_000 });
  expect(body).toContain('pm2_status{name="injected",namespace="default"} 9');
});

test("mocks the pm2 module (callback -> promise)", async () => {
  mock.module("pm2", () => ({
    list: (callback: (error: Error | null, list?: readonly unknown[]) => void) =>
      callback(null, [makeProc({ pm_id: 42, name: "mocked" })]),
  }));
  const pm2 = (await import("pm2")) as unknown as Pm2ListAdapter;
  const body = await collect({ pm2, host: makeHost() });
  expect(body).toContain('name="mocked"');
  expect(body).not.toContain("unique_id");
});

test("collect hides the pm2-logrotate module", async () => {
  const pm2: Pm2ListAdapter = {
    list: (callback) =>
      callback(null, [makeProc({ name: "app" }), makeProc({ name: "pm2-logrotate" })]),
  };
  const body = await collect({ pm2, host: makeHost(), now: 5_000 });
  expect(body).toContain('name="app"');
  expect(body).not.toContain('name="pm2-logrotate"');
});

test("collect renders host CPU and memory gauges", async () => {
  const pm2: Pm2ListAdapter = { list: (callback) => callback(null, []) };
  const body = await collect({
    pm2,
    host: makeHost({ cpu: 25, total: 1_000, used: 250 }),
  });

  expect(body).toContain("host_cpu_usage_percent 25");
  expect(body).toContain("host_cpu_cores 8");
  expect(body).toContain("host_memory_usage_percent 25");
  expect(body).toContain("host_memory_total_bytes 1000");
});

test("collect keeps PM2 metrics when host metrics fail", async () => {
  const pm2: Pm2ListAdapter = {
    list: (callback) => callback(null, [makeProc({ name: "app" })]),
  };
  const host: HostMetricsSource = {
    currentLoad: async () => {
      throw new Error("host unavailable");
    },
    mem: async () => ({ total: 1_000, used: 250, free: 750 }),
    cores: () => 8,
  };
  const errors: string[] = [];
  const body = await collect({
    pm2,
    host,
    now: 5_000,
    log: { error: (message) => errors.push(message) },
  });

  expect(body).toContain('name="app"');
  expect(body).not.toContain("host_cpu_usage_percent");
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("host metrics unavailable");
});

test("collect rejects when pm2.list never calls back (bounded by timeout)", async () => {
  const pm2: Pm2ListAdapter = { list: () => {} };
  await expect(
    collect({ pm2, host: makeHost(), timeoutMs: 30 }),
  ).rejects.toThrow(/did not respond within 30ms/);
});

test("pm2List resolves an empty list when the daemon reports none", async () => {
  const pm2: Pm2ListAdapter = { list: (callback) => callback(null, []) };
  await expect(pm2List(pm2)).resolves.toEqual([]);
});
