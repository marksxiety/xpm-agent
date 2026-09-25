import { describe, expect, mock, test } from "bun:test";
import type { ProcessDescription } from "pm2";
import type { ApiResponse, ProcessDescriptionDetails } from "../../types";

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

function resetState() {
    state.described = [];
    state.describeError = null;
    state.connectError = null;
    pm2Connection.reset();
}

async function getDescribe(processId: number | string): Promise<{ status: number; body: ApiResponse }> {
    const response = await createApp().handle(
        new Request(`http://localhost/pm2/describe/${processId}`, { method: "GET" }),
    );
    return { status: response.status, body: (await response.json()) as ApiResponse };
}

describe("pm2 describe service", () => {
    test("returns a summary/describe/metrics object on success", async () => {
        resetState();
        state.described = [{
            pid: 12345,
            pm_id: 3,
            name: "my-app",
            monit: { cpu: 1.5, memory: 9420800 },
            pm2_env: {
                status: "online",
                pm_uptime: Date.now() - 60000,
                restart_time: 1,
                unstable_restarts: 0,
                exec_mode: "fork",
                exec_interpreter: "bun",
                pm_cwd: "C:\\Apps\\my-app",
                namespace: "XPM",
                watch: false,
                autorestart: true,
                version: "1.2.3",
                pm_exec_path: "C:\\Apps\\my-app\\dist\\index.js",
                pm_out_log_path: "C:\\logs\\my-app-out.log",
                pm_err_log_path: "C:\\logs\\my-app-error.log",
                pm_pid_path: "C:\\pids\\my-app.pid",
                node_args: ["--env-file=.env"],
                node_version: "26.3.0",
                env: { NODE_ENV: "production" },
                created_at: 1758246546651,
                axm_monitor: { "Heap Size": { value: "3.92", unit: "MiB" } },
            } as ProcessDescription["pm2_env"],
        }];

        const response = await processController.describeProcess(3);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process described successfully");
        const info = response.info as ProcessDescriptionDetails;
        expect(Array.isArray(info)).toBe(false);
        expect(info.summary.name).toBe("my-app");
        expect(info.describe.version).toBe("1.2.3");
        expect(info.describe.script_path).toBe("C:\\Apps\\my-app\\dist\\index.js");
        expect(info.describe.interpreter_args).toEqual(["--env-file=.env"]);
        expect(info.describe.node_version).toBe("26.3.0");
        expect(info.describe.node_env).toBe("production");
        expect(info.describe.created_at).toBe(new Date(1758246546651).toISOString());
        expect(info.metrics).toEqual({ "Heap Size": { value: "3.92", unit: "MiB" } });
    });

    test("returns null for absent describe fields and empty metrics for non-Node processes", async () => {
        resetState();
        state.described = [{ pm_id: 5, name: "py-app", pm2_env: { status: "online", exec_interpreter: "python" } as ProcessDescription["pm2_env"] }];

        const response = await processController.describeProcess(5);

        const info = response.info as ProcessDescriptionDetails;
        expect(info.describe.node_version).toBeNull();
        expect(info.describe.node_env).toBeNull();
        expect(info.describe.interpreter_args).toBeNull();
        expect(info.describe.script_args).toBeNull();
        expect(info.describe.script_path).toBeNull();
        expect(info.describe.created_at).toBeNull();
        expect(info.metrics).toEqual({});
        expect(info.describe.entire_log_path).toBeUndefined();
        expect(info.describe.cron_restart).toBeUndefined();
        expect(info.describe.max_memory_restart).toBeUndefined();
    });

    test("includes conditional describe fields only when configured", async () => {
        resetState();
        state.described = [{
            pm_id: 6,
            name: "job",
            pm2_env: {
                status: "online",
                pm_log_path: "C:\\logs\\job-combined.log",
                cron_restart: "*/5 * * * *",
                max_memory_restart: "500M",
            } as ProcessDescription["pm2_env"],
        }];

        const response = await processController.describeProcess(6);

        const info = response.info as ProcessDescriptionDetails;
        expect(info.describe.entire_log_path).toBe("C:\\logs\\job-combined.log");
        expect(info.describe.cron_restart).toBe("*/5 * * * *");
        expect(info.describe.max_memory_restart).toBe("500M");
    });

    test("returns 404 when PM2 returns no descriptions", async () => {
        resetState();

        const response = await processController.describeProcess(99);

        expect(response.success).toBe(false);
        expect(response.status).toBe(404);
        expect(response.code).toBe("PROCESS_NOT_FOUND");
        expect(response.message).toBe("Process 99 not found");
    });

    test("returns 404 when PM2 reports process not found", async () => {
        resetState();
        state.describeError = new Error("Process not found");

        const response = await processController.describeProcess(99);

        expect(response.success).toBe(false);
        expect(response.status).toBe(404);
        expect(response.code).toBe("PROCESS_NOT_FOUND");
        expect(response.message).toBe("Process not found");
    });

    test("returns 503 when the PM2 daemon is unreachable", async () => {
        resetState();
        state.connectError = new Error("connect ECONNREFUSED 127.0.0.1:4444");

        const response = await processController.describeProcess(3);

        expect(response.success).toBe(false);
        expect(response.status).toBe(503);
        expect(response.code).toBe("PM2_DAEMON_UNAVAILABLE");
        expect(response.message).toBe("Cannot connect to PM2 daemon");
    });

    test("returns 500 with the raw message on an unexpected error", async () => {
        resetState();
        state.describeError = new Error("Unexpected error");

        const response = await processController.describeProcess(3);

        expect(response.success).toBe(false);
        expect(response.status).toBe(500);
        expect(response.code).toBe("PM2_OPERATION_FAILED");
        expect(response.message).toBe("PM2 operation failed: Unexpected error");
    });
});

describe("pm2 describe route", () => {
    test("returns 200 when describing an existing process", async () => {
        resetState();
        state.described = [{ pm_id: 3, name: "my-app" }];

        const { status, body } = await getDescribe(3);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe("PM2 process described successfully");
    });

    test("returns 404 when the process does not exist", async () => {
        resetState();

        const { status, body } = await getDescribe(99);

        expect(status).toBe(404);
        expect(body.success).toBe(false);
        expect(body.code).toBe("PROCESS_NOT_FOUND");
        expect(body.message).toBe("Process 99 not found");
    });

    test("returns 422 when the id is not numeric", async () => {
        resetState();

        const { status, body } = await getDescribe("abc");

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.code).toBe("VALIDATION_FAILED");
        expect(body.message).toContain("Validation failed");
    });
});