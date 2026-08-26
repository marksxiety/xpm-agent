import { describe, expect, mock, test, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import type { ProcessDescription } from "pm2";
import type { ApiResponse, ProcessLogs } from "../../types";
import { DEFAULT_TAIL_LINES, MAX_TAIL_LINES } from "../../utils/log";

const TEMP_DIR = path.join(os.tmpdir(), `pm2-logs-test-${Date.now()}`);
const OUT_LOG = path.join(TEMP_DIR, "out.log");
const ERROR_LOG = path.join(TEMP_DIR, "error.log");

const state = {
  described: [] as ProcessDescription[],
  describeError: null as Error | null,
  connectError: null as Error | null,
};

mock.module("node:fs", () => ({
  promises: fs,
}));

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
const { createApp } = await import("../../index");

function resetState() {
  state.described = [];
  state.describeError = null;
  state.connectError = null;
}

function buildContent(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, index) => `log-line-${index + 1}`).join("\n") + "\n";
}

async function getLogs(pathAndQuery: string): Promise<{ status: number; body: ApiResponse }> {
  const response = await createApp().handle(
    new Request(`http://localhost/pm2/logs${pathAndQuery}`, { method: "GET" }),
  );
  return { status: response.status, body: (await response.json()) as ApiResponse };
}

describe("pm2 logs service", () => {
  beforeEach(async () => {
    resetState();
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.rm(OUT_LOG, { force: true });
    await fs.rm(ERROR_LOG, { force: true });
    state.described = [
      {
        pm_id: 3,
        name: "my-app",
        pm2_env: { pm_out_log_path: OUT_LOG, pm_err_log_path: ERROR_LOG },
      },
    ] as ProcessDescription[];
  });

  afterAll(async () => {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  });

  test("returns both streams with tail applied", async () => {
    await fs.writeFile(OUT_LOG, buildContent(5), "utf8");
    await fs.writeFile(ERROR_LOG, buildContent(4), "utf8");

    const response = await processController.getLogs(3, 2);

    expect(response.success).toBe(true);
    expect(response.message).toBe("PM2 process logs retrieved successfully");
    expect((response.info as ProcessLogs).out).toEqual(["log-line-4", "log-line-5"]);
    expect((response.info as ProcessLogs).error).toEqual(["log-line-3", "log-line-4"]);
  });

  test("returns only the output stream when type is output", async () => {
    await fs.writeFile(OUT_LOG, buildContent(5), "utf8");
    await fs.writeFile(ERROR_LOG, buildContent(4), "utf8");

    const response = await processController.getLogs(3, 2, "output");

    expect(response.success).toBe(true);
    expect((response.info as ProcessLogs).out).toEqual(["log-line-4", "log-line-5"]);
    expect((response.info as ProcessLogs).error).toBeUndefined();
  });

  test("returns only the error stream when type is error", async () => {
    await fs.writeFile(OUT_LOG, buildContent(5), "utf8");
    await fs.writeFile(ERROR_LOG, buildContent(4), "utf8");

    const response = await processController.getLogs(3, 2, "error");

    expect(response.success).toBe(true);
    expect((response.info as ProcessLogs).out).toBeUndefined();
    expect((response.info as ProcessLogs).error).toEqual(["log-line-3", "log-line-4"]);
  });

  test("returns DEFAULT_TAIL_LINES when tail is omitted", async () => {
    await fs.writeFile(OUT_LOG, buildContent(DEFAULT_TAIL_LINES + 10), "utf8");

    const response = await processController.getLogs(3);

    expect(response.success).toBe(true);
    expect((response.info as ProcessLogs).out).toHaveLength(DEFAULT_TAIL_LINES);
    expect((response.info as ProcessLogs).out?.[0]).toBe("log-line-11");
  });

  test("caps the tail at MAX_TAIL_LINES", async () => {
    await fs.writeFile(OUT_LOG, buildContent(MAX_TAIL_LINES + 100), "utf8");

    const response = await processController.getLogs(3, MAX_TAIL_LINES + 100);

    expect(response.success).toBe(true);
    expect((response.info as ProcessLogs).out).toHaveLength(MAX_TAIL_LINES);
  });

  test("returns an empty array when a log file does not exist", async () => {
    await fs.writeFile(ERROR_LOG, buildContent(4), "utf8");

    const response = await processController.getLogs(3, 5);

    expect(response.success).toBe(true);
    expect((response.info as ProcessLogs).out).toEqual([]);
    expect((response.info as ProcessLogs).error).toEqual(["log-line-1", "log-line-2", "log-line-3", "log-line-4"]);
  });

  test("returns empty streams when the process has no log paths", async () => {
    state.described = [{ pm_id: 3, name: "my-app" }] as ProcessDescription[];

    const response = await processController.getLogs(3, 5);

    expect(response.success).toBe(true);
    expect((response.info as ProcessLogs).out).toEqual([]);
    expect((response.info as ProcessLogs).error).toEqual([]);
  });

  test("returns 404 when the process does not exist", async () => {
    state.described = [];

    const response = await processController.getLogs(99);

    expect(response.success).toBe(false);
    expect(response.status).toBe(404);
    expect(response.code).toBe("PROCESS_NOT_FOUND");
    expect(response.message).toBe("Process 99 not found");
  });

  test("returns 503 when the PM2 daemon is unreachable", async () => {
    state.connectError = new Error("connect ECONNREFUSED 127.0.0.1:4444");

    const response = await processController.getLogs(3);

    expect(response.success).toBe(false);
    expect(response.status).toBe(503);
    expect(response.code).toBe("PM2_DAEMON_UNAVAILABLE");
    expect(response.message).toBe("Cannot connect to PM2 daemon");
  });

  test("returns 500 with the raw message on an unexpected describe error", async () => {
    state.describeError = new Error("Unexpected error");

    const response = await processController.getLogs(3);

    expect(response.success).toBe(false);
    expect(response.status).toBe(500);
    expect(response.code).toBe("PM2_OPERATION_FAILED");
    expect(response.message).toBe("PM2 operation failed: Unexpected error");
  });
});

describe("pm2 logs route", () => {
  beforeEach(async () => {
    resetState();
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.rm(OUT_LOG, { force: true });
    await fs.rm(ERROR_LOG, { force: true });
    state.described = [
      {
        pm_id: 3,
        name: "my-app",
        pm2_env: { pm_out_log_path: OUT_LOG, pm_err_log_path: ERROR_LOG },
      },
    ] as ProcessDescription[];
  });

  afterAll(async () => {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  });

  test("returns 200 with out and error when type is both", async () => {
    await fs.writeFile(OUT_LOG, buildContent(5), "utf8");
    await fs.writeFile(ERROR_LOG, buildContent(4), "utf8");

    const { status, body } = await getLogs("/3?tail=2&type=both");

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect((body.info as ProcessLogs).out).toEqual(["log-line-4", "log-line-5"]);
    expect((body.info as ProcessLogs).error).toEqual(["log-line-3", "log-line-4"]);
  });

  test("returns 200 with only out when type is output", async () => {
    await fs.writeFile(OUT_LOG, buildContent(5), "utf8");

    const { status, body } = await getLogs("/3?tail=2&type=output");

    expect(status).toBe(200);
    expect((body.info as ProcessLogs).out).toEqual(["log-line-4", "log-line-5"]);
    expect((body.info as ProcessLogs).error).toBeUndefined();
  });

  test("returns 422 when the id is not numeric", async () => {
    const { status, body } = await getLogs("/abc");

    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.message).toContain("Validation failed");
  });

  test("returns 404 when the id is omitted", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/pm2/logs", { method: "GET" }),
    );

    expect(response.status).toBe(404);
  });

  test("returns 422 when tail exceeds the maximum", async () => {
    const { status, body } = await getLogs(`/3?tail=${MAX_TAIL_LINES + 1}`);

    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  test("returns 422 when tail is below the minimum", async () => {
    const { status, body } = await getLogs("/3?tail=0");

    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  test("returns 422 when type is invalid", async () => {
    const { status, body } = await getLogs("/3?type=invalid");

    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_FAILED");
  });
});