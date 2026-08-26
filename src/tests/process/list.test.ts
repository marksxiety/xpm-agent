import { describe, expect, mock, test, setSystemTime, beforeEach, afterAll } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProcessDescription } from "pm2";
import type { ApiResponse, ProcessSummary } from "../../types";

const state = { 
    processes: [] as ProcessDescription[],
    listError: null as Error | null
}

mock.module("node:fs", () => ({
    promises: fs,
}));

mock.module("pm2", () => ({
    default: {
        connect(cb: (err?: Error | null) => void) { 
            cb(null);
        },
        disconnect() {},
        list(cb: (err?: Error | null, list?: ProcessDescription[]) => void) { 
            cb(state.listError, state.processes);
        }
    },
}));

const { pm2Service } = await import("../../services/pm2.service");
const { createApp } = await import("../../index");

const TEMP_DIR = path.join(os.tmpdir(), `pm2-list-test-${Date.now()}`);
const OUT_LOG = path.join(TEMP_DIR, "out.log");
const ERROR_LOG = path.join(TEMP_DIR, "error.log");

function buildContent(lineCount: number): string {
    return Array.from({ length: lineCount }, (_, index) => `list-log-${index + 1}`).join("\n") + "\n";
}

describe("p2m list command", () => {
    test("return an empty list when no processes are running", async () => {
        state.processes = [];
        state.listError = null;

        const response = await pm2Service.listProcesses();
        expect(response.success).toBe(true);
        expect(response.info).toEqual([]);
    });

    test("return a list of processes when some are running", async () => {
        const FIXED_NOW = new Date("2023-07-22T04:26:40.000Z").getTime();
        setSystemTime(FIXED_NOW)

        state.processes = [
            {
                pid: 12345,
                pm_id: 0,
                name: "client",
                monit: { cpu: 2.5, memory: 52428800 },
                pm2_env: {
                    status: "online",
                    pm_uptime: FIXED_NOW - 1689996400000,
                    restart_time: 0,
                    unstable_restarts: 0,
                    exec_mode: "fork",
                    instances: 1,
                    exec_interpreter: "node",
                    pm_cwd: "C:\\Apps\\DPR\\client",
                    namespace: "DPR",
                    watch: false,
                    autorestart: true,
                } as ProcessDescription["pm2_env"],
            },
            {
                pid: 12346,
                pm_id: 1,
                name: "api",
                monit: { cpu: 1.2, memory: 67108864 },
                pm2_env: {
                    status: "online",
                    pm_uptime: FIXED_NOW - 1689992800000,
                    restart_time: 2,
                    unstable_restarts: 0,
                    exec_mode: "fork",
                    instances: 1,
                    exec_interpreter: "bun",
                    pm_cwd: "C:\\Apps\\DPR\\api",
                    namespace: "DPR",
                    watch: false,
                    autorestart: true,
                } as ProcessDescription["pm2_env"],
            },
        ];
        state.listError = null;

        const response = await pm2Service.listProcesses();
        expect(response.success).toBe(true);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const summaries = response.info?.map(({ ip_address, ...summary }) => summary);
        expect(summaries).toEqual([
            {
                pid: 12345,
                pm_id: 0,
                name: "client",
                namespace: "DPR",
                status: "online",
                uptime: 1689996400000,
                restarts: 0,
                unstable_restarts: 0,
                exec_mode: "fork",
                instances: 1,
                interpreter: "node",
                cpu: 2.5,
                memory: 52428800,
                cwd: "C:\\Apps\\DPR\\client",
                watch: false,
                autorestart: true,
            },
            {
                pid: 12346,
                pm_id: 1,
                name: "api",
                namespace: "DPR",
                status: "online",
                uptime: 1689992800000,
                restarts: 2,
                unstable_restarts: 0,
                exec_mode: "fork",
                instances: 1,
                interpreter: "bun",
                cpu: 1.2,
                memory: 67108864,
                cwd: "C:\\Apps\\DPR\\api",
                watch: false,
                autorestart: true,
            },
        ]);
    });

    test("return an empty list when pm2 returns undefined", async () => {
        state.processes = undefined as unknown as ProcessDescription[];
        state.listError = null;

        const response = await pm2Service.listProcesses();
        expect(response.success).toBe(true);
        expect(response.info).toEqual([]);
    });

    test("return 503 when the PM2 daemon is not running", async () => {
        state.processes = [];
        state.listError = new Error("PM2 daemon not running");

        const response = await pm2Service.listProcesses();
        expect(response.success).toBe(false);
        expect(response.status).toBe(503);
        expect(response.code).toBe("PM2_DAEMON_UNAVAILABLE");
        expect(response.message).toBe("Cannot connect to PM2 daemon");
    });

    test("return 500 when returns unexpected error", async () => {
        state.processes = [];
        state.listError = new Error("Unexpected error");

        const response = await pm2Service.listProcesses();
        expect(response.success).toBe(false);
        expect(response.status).toBe(500);
        expect(response.code).toBe("PM2_OPERATION_FAILED");
        expect(response.message).toBe("PM2 operation failed: Unexpected error");
    });

    test("return 404 when returns process not found error", async () => {
        state.processes = [];
        state.listError = new Error("Process not found");

        const response = await pm2Service.listProcesses();
        expect(response.success).toBe(false);
        expect(response.status).toBe(404);
        expect(response.code).toBe("PROCESS_NOT_FOUND");
        expect(response.message).toBe("Process not found");
    });

    test("return 400 when returns script not found error", async () => {
        state.processes = [];
        state.listError = new Error("Script not found");
        const response = await pm2Service.listProcesses();
        
        expect(response.success).toBe(false);
        expect(response.status).toBe(400);
        expect(response.code).toBe("SCRIPT_NOT_FOUND");
        expect(response.message).toBe("Script not found — check the 'script' path in your request");
    })
});

describe("pm2 list with logs", () => {
    beforeEach(async () => {
        await fs.mkdir(TEMP_DIR, { recursive: true });
        await fs.rm(OUT_LOG, { force: true });
        await fs.rm(ERROR_LOG, { force: true });
        state.processes = [{
            pid: 12345,
            pm_id: 0,
            name: "client",
            pm2_env: {
                pm_out_log_path: OUT_LOG,
                pm_err_log_path: ERROR_LOG,
            } as ProcessDescription["pm2_env"],
        }];
        state.listError = null;
    });

    afterAll(async () => {
        await fs.rm(TEMP_DIR, { recursive: true, force: true });
    });

    test("attaches trailing lines from both log streams when tail is provided", async () => {
        await fs.writeFile(OUT_LOG, buildContent(5), "utf8");
        await fs.writeFile(ERROR_LOG, buildContent(4), "utf8");

        const response = await pm2Service.listProcesses(2);

        expect(response.success).toBe(true);
        expect((response.info as ProcessSummary[])?.[0].logs).toEqual({
            out: ["list-log-4", "list-log-5"],
            error: ["list-log-3", "list-log-4"],
        });
    });

    test("attaches empty arrays for log files that do not exist", async () => {
        await fs.writeFile(ERROR_LOG, buildContent(4), "utf8");

        const response = await pm2Service.listProcesses(2);

        expect(response.success).toBe(true);
        expect((response.info as ProcessSummary[])?.[0].logs).toEqual({
            out: [],
            error: ["list-log-3", "list-log-4"],
        });
    });

    test("does not attach logs when tail is omitted", async () => {
        await fs.writeFile(OUT_LOG, buildContent(5), "utf8");

        const response = await pm2Service.listProcesses();

        expect(response.success).toBe(true);
        expect((response.info as ProcessSummary[])?.[0].logs).toBeUndefined();
    });
});

describe("pm2 list route with logs", () => {
    beforeEach(async () => {
        await fs.mkdir(TEMP_DIR, { recursive: true });
        await fs.rm(OUT_LOG, { force: true });
        await fs.rm(ERROR_LOG, { force: true });
        state.processes = [{
            pid: 12345,
            pm_id: 0,
            name: "client",
            pm2_env: {
                pm_out_log_path: OUT_LOG,
                pm_err_log_path: ERROR_LOG,
            } as ProcessDescription["pm2_env"],
        }];
        state.listError = null;
    });

    afterAll(async () => {
        await fs.rm(TEMP_DIR, { recursive: true, force: true });
    });

    async function getList(query: string): Promise<{ status: number; body: ApiResponse }> {
        const response = await createApp().handle(
            new Request(`http://localhost/pm2/list${query}`, { method: "GET" }),
        );
        return { status: response.status, body: (await response.json()) as ApiResponse };
    }

    test("returns 200 with logs attached when logs query is provided", async () => {
        await fs.writeFile(OUT_LOG, buildContent(5), "utf8");

        const { status, body } = await getList("?logs=2");

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect((body.info as ProcessSummary[])?.[0].logs?.out).toEqual(["list-log-4", "list-log-5"]);
    });

    test("returns 422 when logs is below the minimum", async () => {
        const { status, body } = await getList("?logs=0");

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.code).toBe("VALIDATION_FAILED");
    });

    test("returns 422 when logs is not numeric", async () => {
        const { status, body } = await getList("?logs=abc");

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.code).toBe("VALIDATION_FAILED");
    });
});