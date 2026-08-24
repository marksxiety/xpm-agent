import { describe, expect, test, setSystemTime } from "bun:test";
import type { ProcessDescription, Proc } from "pm2";

import { summarizeProcess, toProcessDescriptions } from "../../utils/process";

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