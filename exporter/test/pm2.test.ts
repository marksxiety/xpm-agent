import { test, expect, mock } from "bun:test";
import { collect, pm2List, type Pm2ListAdapter } from "../src/pm2";
import { makeProc } from "./support/make-proc";

test("collect uses the injected pm2 adapter", async () => {
  const pm2: Pm2ListAdapter = {
    list: (callback) => callback(null, [makeProc({ name: "injected" })]),
  };
  const body = await collect({ pm2, now: 5_000 });
  expect(body).toContain('pm2_status{name="injected",namespace="default"} 9');
});

test("mocks the pm2 module (callback -> promise)", async () => {
  mock.module("pm2", () => ({
    list: (callback: (error: Error | null, list?: readonly unknown[]) => void) =>
      callback(null, [makeProc({ pm_id: 42, name: "mocked" })]),
  }));
  const pm2 = (await import("pm2")) as unknown as Pm2ListAdapter;
  const body = await collect({ pm2 });
  expect(body).toContain('name="mocked"');
  expect(body).not.toContain("unique_id");
});

test("collect rejects when pm2.list never calls back (bounded by timeout)", async () => {
  const pm2: Pm2ListAdapter = { list: () => {} };
  await expect(collect({ pm2, timeoutMs: 30 })).rejects.toThrow(/did not respond within 30ms/);
});

test("pm2List resolves an empty list when the daemon reports none", async () => {
  const pm2: Pm2ListAdapter = { list: (callback) => callback(null, []) };
  await expect(pm2List(pm2)).resolves.toEqual([]);
});
