import { describe, expect, mock, test } from "bun:test";
import type { ApiResponse } from "../../types";

const state = {
    flushError: null as Error | null,
    connectError: null as Error | null,
};

mock.module("pm2", () => ({
    default: {
        connect(cb: (err?: Error | null) => void) { cb(state.connectError); },
        disconnect() { },
        flush(_id: number, cb: (err?: Error | null) => void) {
            cb(state.flushError);
        },
    },
}));

const { pm2Service } = await import("../../services/pm2.service");
const { createApp } = await import("../../index");

function resetState() {
    state.flushError = null;
    state.connectError = null;
}

async function postFlush(processId?: number | string): Promise<{ status: number; body: ApiResponse }> {
    const url = processId === undefined ? "http://localhost/pm2/flush" : `http://localhost/pm2/flush/${processId}`;
    const response = await createApp().handle(new Request(url, { method: "POST" }));
    return { status: response.status, body: (await response.json()) as ApiResponse };
}

describe("pm2 flush service", () => {
    test("returns success when flushing a valid id", async () => {
        resetState();

        const response = await pm2Service.flushLogs(3);

        expect(response.success).toBe(true);
        expect(response.message).toBe("Logs for process 3 flushed successfully");
        expect(response.info).toBeNull();
    });

    test("returns 400 when the id is not numeric", async () => {
        resetState();

        const response = await pm2Service.flushLogs("abc");

        expect(response.success).toBe(false);
        expect(response.status).toBe(400);
        expect(response.message).toBe("Invalid process id");
    });

    test("returns 400 when the id is omitted", async () => {
        resetState();

        const response = await pm2Service.flushLogs(undefined);

        expect(response.success).toBe(false);
        expect(response.status).toBe(400);
        expect(response.message).toBe("Invalid process id");
    });

    test("returns 503 when the PM2 daemon is unreachable", async () => {
        resetState();
        state.connectError = new Error("connect ECONNREFUSED 127.0.0.1:4444");

        const response = await pm2Service.flushLogs(3);

        expect(response.success).toBe(false);
        expect(response.status).toBe(503);
        expect(response.message).toBe("Cannot connect to PM2 daemon");
    });
});

describe("pm2 flush route", () => {
    test("returns 200 when flushing with an id", async () => {
        resetState();

        const { status, body } = await postFlush(3);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe("Logs for process 3 flushed successfully");
    });

    test("returns 400 when the id is omitted", async () => {
        resetState();

        const { status, body } = await postFlush();

        expect(status).toBe(400);
        expect(body.success).toBe(false);
        expect(body.message).toBe("Invalid process id");
    });

    test("returns 422 when the id is not numeric", async () => {
        resetState();

        const { status, body } = await postFlush("abc");

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.message).toContain("Validation failed");
    });
});