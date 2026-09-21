import { describe, expect, test, setSystemTime } from "bun:test";
import type { ProcessDescription, Proc } from "pm2";

import { summarizeProcess, describeProcessDetails, toProcessDescriptions } from "../../utils/process";

const FIXED_NOW = new Date("2023-07-22T04:26:40.000Z").getTime();

function onlineProcess(overrides: Partial<ProcessDescription> = {}): ProcessDescription {
    return {
        pid: 12345,
        pm_id: 0,
        name: "client",
        monit: { cpu: 2.5, memory: 52428800 },
        pm2_env: {
            status: "online",
            pm_uptime: FIXED_NOW - 60000,
            restart_time: 1,
            unstable_restarts: 0,
            exec_mode: "fork",
            instances: 1,
            exec_interpreter: "node",
            pm_cwd: "C:\\Apps\\DPR\\client",
            namespace: "DPR",
            watch: false,
            autorestart: true,
        } as ProcessDescription["pm2_env"],
        ...overrides,
    };
}

describe("summarizeProcess", () => {
    test("returns a complete summary for an online process", () => {
        setSystemTime(FIXED_NOW);

        const { ip_address, ...summary } = summarizeProcess(onlineProcess());
        expect(summary).toEqual({
            pid: 12345,
            pm_id: 0,
            name: "client",
            namespace: "DPR",
            status: "online",
            uptime: 60000,
            restarts: 1,
            unstable_restarts: 0,
            exec_mode: "fork",
            instances: 1,
            interpreter: "node",
            cpu: 2.5,
            memory: 52428800,
            cwd: "C:\\Apps\\DPR\\client",
            watch: false,
            autorestart: true,
        });
        expect(ip_address).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
    });

    test("returns zero uptime when the process is not online", () => {
        const process = onlineProcess({ pm2_env: { status: "stopped" } as ProcessDescription["pm2_env"] });
        const summary = summarizeProcess(process);
        expect(summary.status).toBe("stopped");
        expect(summary.uptime).toBe(0);
    });

    test("returns zero uptime when pm_uptime is missing", () => {
        const process = onlineProcess({
            pm2_env: { status: "online" } as ProcessDescription["pm2_env"],
        });
        const summary = summarizeProcess(process);
        expect(summary.uptime).toBe(0);
    });

    test("applies defaults when pm2_env fields are missing", () => {
        setSystemTime(FIXED_NOW);

        const process: ProcessDescription = { pm_id: 2 };
        const { ip_address, ...summary } = summarizeProcess(process);
        expect(summary).toEqual({
            pid: 0,
            pm_id: 2,
            name: "",
            namespace: "default",
            status: "unknown",
            uptime: 0,
            restarts: 0,
            unstable_restarts: 0,
            exec_mode: "fork",
            instances: undefined,
            interpreter: "none",
            cpu: 0,
            memory: 0,
            cwd: undefined,
            watch: false,
            autorestart: undefined,
        });
        expect(ip_address).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
    });
});

describe("toProcessDescriptions", () => {
    test("wraps a single process in an array", () => {
        const process = onlineProcess();
        expect(toProcessDescriptions(process)).toEqual([process]);
    });

    test("passes an array through unchanged", () => {
        const processes = [onlineProcess(), onlineProcess({ pid: 2 })];
        expect(toProcessDescriptions(processes)).toEqual(processes);
    });

    test("returns an empty array when input is undefined", () => {
        expect(toProcessDescriptions(undefined)).toEqual([]);
    });

    test("filters out falsy entries", () => {
        const process = onlineProcess();
        const input = [process, null, undefined] as unknown as Proc[];
        expect(toProcessDescriptions(input)).toEqual([process]);
    });
});

const FIXED_CREATED_AT = 1758246546651;

describe("describeProcessDetails", () => {
    test("returns summary, describe, and raw metrics for a fully-populated process", () => {
        setSystemTime(FIXED_NOW);

        const process = onlineProcess({
            pm2_env: {
                status: "online",
                pm_uptime: FIXED_NOW - 60000,
                restart_time: 2,
                unstable_restarts: 0,
                exec_mode: "fork_mode",
                instances: 1,
                exec_interpreter: "bun",
                pm_cwd: "C:\\Apps\\client",
                namespace: "DPR",
                watch: false,
                autorestart: true,
                version: "1.2.3",
                args: ["--port", "3000"],
                pm_exec_path: "C:\\Apps\\client\\index.js",
                pm_out_log_path: "C:\\logs\\client-out.log",
                pm_err_log_path: "C:\\logs\\client-error.log",
                pm_pid_path: "C:\\pids\\client.pid",
                pm_log_path: "C:\\logs\\client-combined.log",
                node_args: ["--max-old-space-size=512"],
                node_version: "20.11.0",
                env: { NODE_ENV: "production" },
                created_at: FIXED_CREATED_AT,
                cron_restart: "0 2 * * *",
                max_memory_restart: "500M",
                axm_monitor: { "Heap Size": { value: "3.92", unit: "MiB" } },
            } as ProcessDescription["pm2_env"],
        });

        const details = describeProcessDetails(process);

        expect(details.summary).toEqual(summarizeProcess(process));
        expect(details.summary.name).toBe("client");
        expect(details.describe).toEqual({
            version: "1.2.3",
            script_path: "C:\\Apps\\client\\index.js",
            script_args: ["--port", "3000"],
            error_log_path: "C:\\logs\\client-error.log",
            out_log_path: "C:\\logs\\client-out.log",
            pid_path: "C:\\pids\\client.pid",
            interpreter_args: ["--max-old-space-size=512"],
            node_version: "20.11.0",
            node_env: "production",
            created_at: new Date(FIXED_CREATED_AT).toISOString(),
            entire_log_path: "C:\\logs\\client-combined.log",
            cron_restart: "0 2 * * *",
            max_memory_restart: "500M",
        });
        expect(details.metrics).toEqual({ "Heap Size": { value: "3.92", unit: "MiB" } });
    });

    test("nulls absent non-conditional fields and omits conditional ones", () => {
        const details = describeProcessDetails({ pm_id: 2 });

        expect(details.describe).toEqual({
            version: null,
            script_path: null,
            script_args: null,
            error_log_path: null,
            out_log_path: null,
            pid_path: null,
            interpreter_args: null,
            node_version: null,
            node_env: null,
            created_at: null,
        });
        expect(details.metrics).toEqual({});
    });

    test("treats empty node_args and invalid created_at as null", () => {
        const details = describeProcessDetails(onlineProcess({
            pm2_env: {
                status: "online",
                node_args: [],
                created_at: Number.NaN,
            } as ProcessDescription["pm2_env"],
        }));

        expect(details.describe.interpreter_args).toBeNull();
        expect(details.describe.created_at).toBeNull();
    });

    test("omits max_memory_restart when falsy", () => {
        const details = describeProcessDetails(onlineProcess({
            pm2_env: { status: "online", max_memory_restart: "" } as ProcessDescription["pm2_env"],
        }));

        expect(details.describe.max_memory_restart).toBeUndefined();
    });
});