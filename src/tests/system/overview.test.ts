import { describe, expect, mock, test } from "bun:test";
import type { ProcessDescription } from "pm2";
import type { ApiResponse } from "../../types";

const state = {
    listed: [] as ProcessDescription[],
    listError: null as Error | null,
    connectError: null as Error | null,
};

mock.module("pm2", () => ({
    default: {
        connect(cb: (err?: Error | null) => void) { cb(state.connectError); },
        disconnect() { },
        list(cb: (err?: Error | null, procs?: ProcessDescription[]) => void) {
            cb(state.listError, state.listed);
        },
    },
}));

const { ProcessController } = await import("../../controller/process.controller");
const { SystemController } = await import("../../controller/system.controller");
const { createApp } = await import("../../index");

const stubSource = {
    currentLoad: async () => ({ currentLoad: 12.5 }),
    mem: async () => ({ total: 1000, used: 600, free: 400 }),
};

function resetState() {
    state.listed = [];
    state.listError = null;
    state.connectError = null;
}

describe("system host overview controller", () => {
    test("returns host cpu usage and memory metrics only", async () => {
        resetState();
        const controller = new SystemController(stubSource);

        const response = await controller.getHostOverview();

        expect(response.success).toBe(true);
        expect(response.message).toBe("System overview retrieved successfully");
        expect(response.info?.host.cpu.usagePercent).toBe(12.5);
        expect(response.info?.host.memory.totalBytes).toBe(1000);
        expect(response.info?.host.memory.freeBytes).toBe(400);
        expect(response.info?.host.memory.usedBytes).toBe(600);
        expect(response.info?.host.memory.percentUsed).toBe(60);
        expect("processes" in (response.info as Record<string, unknown>)).toBe(false);
    });
});

describe("process list with overview", () => {
    test("returns host metrics and process summaries", async () => {
        resetState();
        state.listed = [{ pm_id: 3, name: "my-app", pm2_env: {} }];
        const controller = new ProcessController(stubSource);

        const response = await controller.listProcesses(undefined, true);

        expect(response.success).toBe(true);
        expect(response.info?.overview.cpu.usagePercent).toBe(12.5);
        expect(response.info?.overview.memory.totalBytes).toBe(1000);
        expect(response.info?.overview.memory.freeBytes).toBe(400);
        expect(response.info?.overview.memory.usedBytes).toBe(600);
        expect(response.info?.overview.memory.percentUsed).toBe(60);
        expect(response.info?.processes).toHaveLength(1);
        expect(response.info?.processes[0].name).toBe("my-app");
    });

    test("propagates the process list failure", async () => {
        resetState();
        state.listError = new Error("Process or namespace not found");
        const controller = new ProcessController(stubSource);

        const response = await controller.listProcesses(undefined, true);

        expect(response.success).toBe(false);
        expect(response.status).toBe(404);
        expect(response.code).toBe("PROCESS_NOT_FOUND");
    });
});

describe("system overview route", () => {
    test("GET /system returns 200 with host metrics only", async () => {
        resetState();
        state.listed = [{ pm_id: 3, name: "my-app", pm2_env: {} }];

        const response = await createApp().handle(new Request("http://localhost/pm2/system", { method: "GET" }));
        const body = (await response.json()) as ApiResponse & { info: { host: { cpu: { usagePercent: number } } } };

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.info?.host.cpu.usagePercent).toBe(12.5);
        expect("processes" in (body.info as Record<string, unknown>)).toBe(false);
    });

    test("GET /list?overview=true returns 200 with overview and processes", async () => {
        resetState();
        state.listed = [{ pm_id: 3, name: "my-app", pm2_env: {} }];

        const response = await createApp().handle(
            new Request("http://localhost/pm2/list?overview=true", { method: "GET" }),
        );
        const body = (await response.json()) as ApiResponse & {
            info: { overview: { cpu: { usagePercent: number } }; processes: Array<{ name: string }> };
        };

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.info?.overview.cpu.usagePercent).toBe(12.5);
        expect(body.info?.processes).toHaveLength(1);
        expect(body.info?.processes[0].name).toBe("my-app");
    });

    test("GET /list without overview returns the plain process array", async () => {
        resetState();
        state.listed = [{ pm_id: 3, name: "my-app", pm2_env: {} }];

        const response = await createApp().handle(new Request("http://localhost/pm2/list", { method: "GET" }));
        const body = (await response.json()) as ApiResponse & { info: Array<{ name: string }> };

        expect(response.status).toBe(200);
        expect(Array.isArray(body.info)).toBe(true);
        expect(body.info).toHaveLength(1);
        expect(body.info[0].name).toBe("my-app");
    });
});
