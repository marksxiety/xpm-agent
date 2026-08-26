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

const mockOs = {
    totalmem: () => 1000,
    freemem: () => 400,
    cpus: () => [{ model: "Test CPU", speed: 1000, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }],
    loadavg: () => [1.5, 1.25, 1.0],
};

const { processController } = await import("../../controller/process.controller");
const { SystemController } = await import("../../controller/system.controller");
const { createApp } = await import("../../index");

function resetState() {
    state.listed = [];
    state.listError = null;
    state.connectError = null;
}

describe("system overview controller", () => {
    test("returns host metrics and process summaries", async () => {
        resetState();
        state.listed = [{ pm_id: 3, name: "my-app", pm2_env: {} }];
        const controller = new SystemController(processController, mockOs);

        const response = await controller.getSystemOverview();

        expect(response.success).toBe(true);
        expect(response.message).toBe("System overview retrieved successfully");
        expect(response.info?.host.cpu.cores).toBe(1);
        expect(response.info?.host.cpu.model).toBe("Test CPU");
        expect(response.info?.host.cpu.loadAvg).toEqual([1.5, 1.25, 1.0]);
        expect(response.info?.host.memory.totalBytes).toBe(1000);
        expect(response.info?.host.memory.freeBytes).toBe(400);
        expect(response.info?.host.memory.usedBytes).toBe(600);
        expect(response.info?.host.memory.percentUsed).toBe(60);
        expect(response.info?.processes).toHaveLength(1);
        expect(response.info?.processes[0].name).toBe("my-app");
    });

    test("propagates the process list failure", async () => {
        resetState();
        state.listError = new Error("Process or namespace not found");
        const controller = new SystemController(processController, mockOs);

        const response = await controller.getSystemOverview();

        expect(response.success).toBe(false);
        expect(response.status).toBe(404);
        expect(response.code).toBe("PROCESS_NOT_FOUND");
    });
});

describe("system overview route", () => {
    test("returns 200 with host and processes", async () => {
        resetState();
        state.listed = [{ pm_id: 3, name: "my-app", pm2_env: {} }];

        const response = await createApp().handle(new Request("http://localhost/pm2/system", { method: "GET" }));
        const body = (await response.json()) as ApiResponse & { info: { host: { cpu: { cores: number } }; processes: Array<{ name: string }> } };

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(typeof body.info?.host.cpu.cores).toBe("number");
        expect(body.info?.processes).toHaveLength(1);
        expect(body.info?.processes[0].name).toBe("my-app");
    });
});