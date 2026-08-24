import { describe, expect, mock, test, setSystemTime } from "bun:test";
import type { ProcessDescription } from "pm2";

const state = { 
    processes: [] as ProcessDescription[],
    listError: null as Error | null
}

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