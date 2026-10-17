import { describe, expect, mock, test, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import type { ProcessDescription } from "pm2";
import type { ApiResponse, ProcessLogsClearResult } from "../../types";

const TEMP_DIR = path.join(os.tmpdir(), `pm2-clear-logs-test-${Date.now()}`);
const OUT_LOG = path.join(TEMP_DIR, "my-app-out.log");
const ERROR_LOG = path.join(TEMP_DIR, "my-app-error.log");
const NOT_A_DIR = path.join(TEMP_DIR, "not-a-dir");

const ROTATED_OUT = [
  path.join(TEMP_DIR, "my-app-out__2026-01-01_00-00-00.log"),
  path.join(TEMP_DIR, "my-app-out__2026-01-02_00-00-00.log.gz"),
  path.join(TEMP_DIR, "my-app-out.log.1"),
];
const ROTATED_ERROR = [path.join(TEMP_DIR, "my-app-error__2026-01-01_00-00-00.log")];

const state = {
  described: [] as ProcessDescription[],
  describeError: null as Error | null,
  connectError: null as Error | null,
};

mock.module("pm2", () => ({
  default: {
    connect(cb: (err?: Error | null) => void) { cb(state.connectError); },
    disconnect() { },
    describe(_id: number, cb: (err?: Error | null, procs?: ProcessDescription[]) => void) {
      cb(state.describeError, state.described);
    },
  },
}));

const { processController } = await import("../../controller/process.controller");
const { pm2Connection } = await import("../../pm2/client");
const { createApp } = await import("../../index");

function setProcess(pm2Env: Record<string, unknown>): void {
  state.described = [{ pm_id: 3, name: "my-app", pm2_env: pm2Env } as unknown as ProcessDescription];
}

function resetState(): void {
  state.describeError = null;
  state.connectError = null;
  pm2Connection.reset();
  setProcess({ pm_out_log_path: OUT_LOG, pm_err_log_path: ERROR_LOG });
}

async function cleanFs(): Promise<void> {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  await Promise.all(
    [OUT_LOG, ERROR_LOG, NOT_A_DIR, ...ROTATED_OUT, ...ROTATED_ERROR].map((file) => fs.rm(file, { force: true })),
  );
}

function content(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, index) => `log-line-${index + 1}`).join("\n") + "\n";
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

describe("pm2 clear logs service", () => {
  beforeEach(async () => {
    resetState();
    await cleanFs();
  });

  afterAll(async () => {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  });

  test("rejects an invalid stream with 400", async () => {
    const response = await processController.clearLogs(3, "stdout", "active");

    expect(response.success).toBe(false);
    expect(response.status).toBe(400);
    expect(response.code).toBe("INVALID_LOG_QUERY");
    expect(response.message).toContain("Invalid stream");
  });

  test("rejects an invalid scope with 400", async () => {
    const response = await processController.clearLogs(3, "all", "everything");

    expect(response.success).toBe(false);
    expect(response.status).toBe(400);
    expect(response.code).toBe("INVALID_LOG_QUERY");
    expect(response.message).toContain("Invalid scope");
  });

  test("returns 404 when the process does not exist", async () => {
    state.described = [];

    const response = await processController.clearLogs(99, "all", "active");

    expect(response.success).toBe(false);
    expect(response.status).toBe(404);
    expect(response.code).toBe("PROCESS_NOT_FOUND");
  });

  test("returns 409 for the agent's own process", async () => {
    state.described = [{ pm_id: 0, name: "xpm-agent", pm2_env: { namespace: "XPM" } } as unknown as ProcessDescription];

    const response = await processController.clearLogs(0, "all", "active");

    expect(response.success).toBe(false);
    expect(response.status).toBe(409);
    expect(response.code).toBe("AGENT_SELF_MANAGEMENT_FORBIDDEN");
  });

  test("defaults to stream=all and scope=active, truncating both files in place", async () => {
    await fs.writeFile(OUT_LOG, content(5), "utf8");
    await fs.writeFile(ERROR_LOG, content(4), "utf8");
    const outSize = await sizeOf(OUT_LOG);
    const errSize = await sizeOf(ERROR_LOG);

    const response = await processController.clearLogs(3);

    expect(response.success).toBe(true);
    const info = response.info as ProcessLogsClearResult;
    expect(info.stream).toBe("all");
    expect(info.scope).toBe("active");
    expect(info.truncated).toEqual({ out: outSize, error: errSize });
    expect(info.deleted).toEqual({});
    expect(info.bytesFreed).toBe(outSize + errSize);
    expect(await sizeOf(OUT_LOG)).toBe(0);
    expect(await sizeOf(ERROR_LOG)).toBe(0);
  });

  test("scope=active with stream=out truncates only stdout", async () => {
    await fs.writeFile(OUT_LOG, content(5), "utf8");
    await fs.writeFile(ERROR_LOG, content(4), "utf8");
    const outSize = await sizeOf(OUT_LOG);
    const errSize = await sizeOf(ERROR_LOG);

    const response = await processController.clearLogs(3, "out", "active");

    const info = response.info as ProcessLogsClearResult;
    expect(info.truncated).toEqual({ out: outSize });
    expect(await sizeOf(OUT_LOG)).toBe(0);
    expect(await sizeOf(ERROR_LOG)).toBe(errSize);
  });

  test("scope=rotated deletes rotated archives and leaves active files untouched", async () => {
    await fs.writeFile(OUT_LOG, content(5), "utf8");
    await fs.writeFile(ERROR_LOG, content(4), "utf8");
    await fs.writeFile(ROTATED_OUT[0], "a".repeat(20), "utf8");
    await fs.writeFile(ROTATED_OUT[1], "b".repeat(30), "utf8");
    await fs.writeFile(ROTATED_OUT[2], "c".repeat(10), "utf8");
    await fs.writeFile(ROTATED_ERROR[0], "d".repeat(15), "utf8");

    const response = await processController.clearLogs(3, "all", "rotated");

    const info = response.info as ProcessLogsClearResult;
    expect(info.scope).toBe("rotated");
    expect(info.truncated).toEqual({});
    expect(info.deleted.out).toEqual({ count: 3, bytesFreed: 60 });
    expect(info.deleted.error).toEqual({ count: 1, bytesFreed: 15 });
    expect(info.bytesFreed).toBe(75);
    for (const file of [...ROTATED_OUT, ...ROTATED_ERROR]) expect(await sizeOf(file)).toBe(0);
    expect(await sizeOf(OUT_LOG)).toBeGreaterThan(0);
    expect(await sizeOf(ERROR_LOG)).toBeGreaterThan(0);
  });

  test("scope=all truncates active files and deletes rotated archives", async () => {
    await fs.writeFile(OUT_LOG, content(5), "utf8");
    await fs.writeFile(ROTATED_OUT[0], "a".repeat(20), "utf8");
    const outSize = await sizeOf(OUT_LOG);

    const response = await processController.clearLogs(3, "out", "all");

    const info = response.info as ProcessLogsClearResult;
    expect(info.truncated).toEqual({ out: outSize });
    expect(info.deleted.out).toEqual({ count: 1, bytesFreed: 20 });
    expect(info.bytesFreed).toBe(outSize + 20);
    expect(await sizeOf(OUT_LOG)).toBe(0);
    expect(await sizeOf(ROTATED_OUT[0])).toBe(0);
  });

  test("is a no-op when the log files do not exist", async () => {
    setProcess({
      pm_out_log_path: path.join(TEMP_DIR, "missing-out.log"),
      pm_err_log_path: path.join(TEMP_DIR, "missing-error.log"),
    });

    const response = await processController.clearLogs(3, "all", "all");

    expect(response.success).toBe(true);
    const info = response.info as ProcessLogsClearResult;
    expect(info.truncated).toEqual({ out: 0, error: 0 });
    expect(info.deleted.out).toEqual({ count: 0, bytesFreed: 0 });
    expect(info.deleted.error).toEqual({ count: 0, bytesFreed: 0 });
    expect(info.bytesFreed).toBe(0);
  });

  test("handles a missing log directory gracefully", async () => {
    setProcess({ pm_out_log_path: path.join(TEMP_DIR, "nodir", "x-out.log") });

    const response = await processController.clearLogs(3, "all", "all");

    expect(response.success).toBe(true);
  });

  test("returns 500 when a filesystem operation fails", async () => {
    await fs.writeFile(NOT_A_DIR, "x", "utf8");
    setProcess({ pm_out_log_path: path.join(NOT_A_DIR, "x-out.log") });

    const response = await processController.clearLogs(3, "out", "rotated");

    expect(response.success).toBe(false);
    expect(response.status).toBe(500);
    expect(response.code).toBe("LOG_IO_FAILED");
    expect(response.message).toContain("Log file operation failed");
  });
});

describe("pm2 clear logs route", () => {
  beforeEach(async () => {
    resetState();
    await cleanFs();
  });

  afterAll(async () => {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  });

  async function clearLogsRequest(pathAndQuery: string): Promise<{ status: number; body: ApiResponse }> {
    const response = await createApp().handle(
      new Request(`http://localhost/pm2/logs${pathAndQuery}`, { method: "DELETE" }),
    );
    return { status: response.status, body: (await response.json()) as ApiResponse };
  }

  test("returns 200 with defaults when no query is provided", async () => {
    await fs.writeFile(OUT_LOG, content(3), "utf8");

    const { status, body } = await clearLogsRequest("/3");

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe("Process 3 logs cleared successfully");
  });

  test("returns 200 when valid stream and scope are provided", async () => {
    const { status, body } = await clearLogsRequest("/3?stream=err&scope=rotated");

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  test("returns 400 for an invalid stream", async () => {
    const { status, body } = await clearLogsRequest("/3?stream=nope");

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INVALID_LOG_QUERY");
  });

  test("returns 400 for an invalid scope", async () => {
    const { status, body } = await clearLogsRequest("/3?scope=nope");

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INVALID_LOG_QUERY");
  });

  test("returns 422 when the id is not numeric", async () => {
    const { status, body } = await clearLogsRequest("/abc");

    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_FAILED");
  });
});
