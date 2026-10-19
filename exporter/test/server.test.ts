import { test, expect } from "bun:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "../src/server";
import type { Pm2ListAdapter } from "../src/pm2";
import { makeProc } from "./support/make-proc";

async function request(server: Server, path: string) {
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`);
}

test("handler returns 200 with metrics when PM2 is reachable", async () => {
  const pm2: Pm2ListAdapter = {
    list: (callback) => callback(null, [makeProc({ pm2_env: { pm_uptime: Date.now() - 60_000 } })]),
  };
  const server = createServer({ pm2 });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const res = await request(server, "/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("pm2_status");
    // Regression: the handler must pass a timestamp, not the Date.now function.
    expect(body).not.toContain("NaN");
  } finally {
    server.close();
  }
});

test("handler returns 503 and logs when PM2 is unreachable", async () => {
  const pm2: Pm2ListAdapter = { list: (callback) => callback(new Error("daemon down")) };
  const errors: string[] = [];
  const server = createServer({ pm2, log: { error: (message) => errors.push(message) } });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const res = await request(server, "/metrics");
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("PM2 unreachable");
    expect(errors).toHaveLength(1);
  } finally {
    server.close();
  }
});

test("handler 404s unknown paths", async () => {
  const server = createServer({ pm2: { list: (callback) => callback(null, []) } });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const res = await request(server, "/nope");
    expect(res.status).toBe(404);
  } finally {
    server.close();
  }
});

test("handler returns 503 when pm2.list hangs", async () => {
  const errors: string[] = [];
  const server = createServer({
    pm2: { list: () => {} },
    timeoutMs: 30,
    log: { error: (message) => errors.push(message) },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const res = await request(server, "/metrics");
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("PM2 unreachable");
    expect(errors[0]).toContain("did not respond");
  } finally {
    server.close();
  }
});
