import { describe, expect, mock, test } from "bun:test";
import type { ProcessDescription } from "pm2";
import type { ApiResponse, ProcessSummary } from "../../types";

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
const { createApp } = await import("../../index");

function resetState() {
    state.described = [];
    state.describeError = null;
    state.connectError = null;
}

async function getDescribe(processId: number | string): Promise<{ status: number; body: ApiResponse }> {
    const response = await createApp().handle(
        new Request(`http://localhost/pm2/describe/${processId}`, { method: "GET" }),
    );
    return { status: response.status, body: (await response.json()) as ApiResponse };
}

describe("pm2 describe service", () => {
    test("returns the described process summaries on success", async () => {
        resetState();
        state.described = [{ pm_id: 3, name: "my-app" }];

        const response = await processController.describeProcess(3);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process described successfully");
        expect(response.info).toHaveLength(1);
        expect((response.info as ProcessSummary[])?.[0].name).toBe("my-app");
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