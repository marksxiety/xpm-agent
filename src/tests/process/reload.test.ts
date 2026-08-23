import { describe, expect, mock, test } from "bun:test";
import type { ProcessDescription } from "pm2";
import type { ApiResponse, ProcessSummary } from "../../types";

const state = {
    reloaded: [] as ProcessDescription[],
    reloadError: null as Error | null,
    connectError: null as Error | null,
};

mock.module("pm2", () => ({
    default: {
        connect(cb: (err?: Error | null) => void) { cb(state.connectError); },
        disconnect() { },
        reload(_id: number, cb: (err?: Error | null, procs?: ProcessDescription[]) => void) {
            cb(state.reloadError, state.reloaded);
        },
    },
}));

const { pm2Service } = await import("../../services/pm2.service");
const { createApp } = await import("../../index");

function resetState() {
    state.reloaded = [];
    state.reloadError = null;
    state.connectError = null;
}

async function postReload(processId: number | string): Promise<{ status: number; body: ApiResponse }> {
    const response = await createApp().handle(
        new Request(`http://localhost/pm2/reload/${processId}`, { method: "POST" }),
    );
    return { status: response.status, body: (await response.json()) as ApiResponse };
}

describe("pm2 reload service", () => {
    test("returns the reloaded process summaries on success", async () => {
        resetState();
        state.reloaded = [{ pm_id: 3, name: "my-app" }];

        const response = await pm2Service.reloadProcess(3);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process reloaded successfully");
        expect(response.info).toHaveLength(1);
        expect((response.info as ProcessSummary[])?.[0].name).toBe("my-app");
    });

    test("returns 404 when the process is not found", async () => {
        resetState();
        state.reloadError = new Error("Process not found");

        const response = await pm2Service.reloadProcess(99);

        expect(response.success).toBe(false);
        expect(response.status).toBe(404);
        expect(response.message).toBe("Process not found");
    });

    test("returns 503 when the PM2 daemon is unreachable", async () => {
        resetState();
        state.connectError = new Error("connect ECONNREFUSED 127.0.0.1:4444");

        const response = await pm2Service.reloadProcess(3);

        expect(response.success).toBe(false);
        expect(response.status).toBe(503);
        expect(response.message).toBe("Cannot connect to PM2 daemon");
    });

    test("returns 500 with the raw message on an unexpected error", async () => {
        resetState();
        state.reloadError = new Error("Unexpected error");

        const response = await pm2Service.reloadProcess(3);

        expect(response.success).toBe(false);
        expect(response.status).toBe(500);
        expect(response.message).toBe("PM2 operation failed: Unexpected error");
    });
});

describe("pm2 reload route", () => {
    test("returns 200 when reloading an existing process", async () => {
        resetState();
        state.reloaded = [{ pm_id: 3, name: "my-app" }];

        const { status, body } = await postReload(3);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe("PM2 process reloaded successfully");
    });

    test("returns 404 when the process does not exist", async () => {
        resetState();
        state.reloadError = new Error("Process not found");

        const { status, body } = await postReload(99);

        expect(status).toBe(404);
        expect(body.success).toBe(false);
        expect(body.message).toBe("Process not found");
    });

    test("returns 422 when the id is not numeric", async () => {
        resetState();

        const { status, body } = await postReload("abc");

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.message).toContain("Validation failed");
    });
});