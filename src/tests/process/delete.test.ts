import { describe, expect, mock, test } from "bun:test";
import type { ProcessDescription } from "pm2";
import type { ApiResponse, ProcessSummary } from "../../types";

const fsState = {
    unlinkError: null as Error | null,
    unlinkCalls: [] as string[],
};

mock.module("node:fs", () => ({
    promises: {
        unlink: async (filePath: string) => {
            fsState.unlinkCalls.push(filePath);
            if (fsState.unlinkError) throw fsState.unlinkError;
        },
    },
}));

const state = {
    described: [] as ProcessDescription[],
    deleted: [] as ProcessDescription[],
    describeError: null as Error | null,
    deleteError: null as Error | null,
    connectError: null as Error | null,
};

mock.module("pm2", () => ({
    default: {
        connect(cb: (err?: Error | null) => void) { cb(state.connectError); },
        disconnect() { },
        describe(_id: number, cb: (err?: Error | null, procs?: ProcessDescription[]) => void) {
            cb(state.describeError, state.described);
        },
        delete(_id: number, cb: (err?: Error | null, procs?: ProcessDescription[]) => void) {
            cb(state.deleteError, state.deleted);
        },
    },
}));

const { pm2Service } = await import("../../services/pm2.service");
const { createApp } = await import("../../index");

function resetState() {
    state.described = [];
    state.deleted = [];
    state.describeError = null;
    state.deleteError = null;
    state.connectError = null;
    fsState.unlinkCalls = [];
    fsState.unlinkError = null;
}

async function requestDelete(processId: number | string, body?: object): Promise<{ status: number; body: ApiResponse }> {
    const response = await createApp().handle(
        new Request(`http://localhost/pm2/delete/${processId}`, {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body ?? {}),
        }),
    );
    return { status: response.status, body: (await response.json()) as ApiResponse };
}

describe("pm2 delete service", () => {
    test("returns the deleted process summaries on success", async () => {
        resetState();
        state.deleted = [{ pm_id: 3, name: "my-app" }];

        const response = await pm2Service.deleteProcess(3);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process deleted successfully");
        expect(response.info).toHaveLength(1);
        expect((response.info as ProcessSummary[])?.[0].name).toBe("my-app");
    });

    test("returns success when delete_logs is true even if log file removal fails", async () => {
        resetState();
        state.described = [{
            pm_id: 3,
            name: "my-app",
            pm2_env: {
                pm_out_log_path: "C:\\nonexistent\\my-app-out.log",
                pm_err_log_path: "C:\\nonexistent\\my-app-error.log",
            } as ProcessDescription["pm2_env"],
        }];
        state.deleted = [{ pm_id: 3, name: "my-app" }];

        const response = await pm2Service.deleteProcess(3, true);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process deleted successfully");
        expect(response.info).toHaveLength(1);
    });

    test("returns success and unlinks both log files when a log file does not exist", async () => {
        resetState();
        state.described = [{
            pm_id: 3,
            name: "my-app",
            pm2_env: {
                pm_out_log_path: "C:\\nonexistent\\my-app-out.log",
                pm_err_log_path: "C:\\nonexistent\\my-app-error.log",
            } as ProcessDescription["pm2_env"],
        }];
        state.deleted = [{ pm_id: 3, name: "my-app" }];
        fsState.unlinkError = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
        const originalConsoleError = console.error;
        const errorSpy = mock((message: string, ...args: unknown[]) => {});
        console.error = errorSpy;

        const response = await pm2Service.deleteProcess(3, true);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process deleted successfully");
        expect(fsState.unlinkCalls).toEqual([
            "C:\\nonexistent\\my-app-out.log",
            "C:\\nonexistent\\my-app-error.log",
        ]);
        console.error = originalConsoleError;
    });

    test("logs the failure to console.error when log file removal fails", async () => {
        resetState();
        state.described = [{
            pm_id: 3,
            name: "my-app",
            pm2_env: {
                pm_out_log_path: "C:\\nonexistent\\my-app-out.log",
                pm_err_log_path: "C:\\nonexistent\\my-app-error.log",
            } as ProcessDescription["pm2_env"],
        }];
        state.deleted = [{ pm_id: 3, name: "my-app" }];
        fsState.unlinkError = new Error("EPERM: operation not permitted, unlink");
        const originalConsoleError = console.error;
        const errorSpy = mock((message: string, ...args: unknown[]) => {});
        console.error = errorSpy;

        const response = await pm2Service.deleteProcess(3, true);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process deleted successfully");
        expect(errorSpy.mock.calls.length).toBe(2);
        expect(errorSpy.mock.calls[0][0]).toContain("my-app-out.log");
        console.error = originalConsoleError;
    });

    test("returns 404 when the process is not found", async () => {
        resetState();
        state.deleteError = new Error("Process not found");

        const response = await pm2Service.deleteProcess(99);

        expect(response.success).toBe(false);
        expect(response.status).toBe(404);
        expect(response.message).toBe("Process not found");
    });

    test("returns 503 when the PM2 daemon is unreachable", async () => {
        resetState();
        state.connectError = new Error("connect ECONNREFUSED 127.0.0.1:4444");

        const response = await pm2Service.deleteProcess(3);

        expect(response.success).toBe(false);
        expect(response.status).toBe(503);
        expect(response.message).toBe("Cannot connect to PM2 daemon");
    });

    test("returns 500 with the raw message on an unexpected delete error", async () => {
        resetState();
        state.deleteError = new Error("Unexpected error");

        const response = await pm2Service.deleteProcess(3);

        expect(response.success).toBe(false);
        expect(response.status).toBe(500);
        expect(response.message).toBe("PM2 operation failed: Unexpected error");
    });

    test("returns the describe error when delete_logs is true and describe fails", async () => {
        resetState();
        state.describeError = new Error("Unexpected error");

        const response = await pm2Service.deleteProcess(3, true);

        expect(response.success).toBe(false);
        expect(response.status).toBe(500);
        expect(response.message).toBe("PM2 operation failed: Unexpected error");
    });
});

describe("pm2 delete route", () => {
    test("returns 200 when deleting an existing process", async () => {
        resetState();
        state.deleted = [{ pm_id: 3, name: "my-app" }];

        const { status, body } = await requestDelete(3);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe("PM2 process deleted successfully");
    });

    test("returns 200 when deleting with delete_logs enabled", async () => {
        resetState();
        state.described = [{
            pm_id: 3,
            name: "my-app",
            pm2_env: {
                pm_out_log_path: "C:\\nonexistent\\my-app-out.log",
                pm_err_log_path: "C:\\nonexistent\\my-app-error.log",
            } as ProcessDescription["pm2_env"],
        }];
        state.deleted = [{ pm_id: 3, name: "my-app" }];

        const { status, body } = await requestDelete(3, { delete_logs: true });

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe("PM2 process deleted successfully");
    });

    test("returns 404 when the process does not exist", async () => {
        resetState();
        state.deleteError = new Error("Process not found");

        const { status, body } = await requestDelete(99);

        expect(status).toBe(404);
        expect(body.success).toBe(false);
        expect(body.message).toBe("Process not found");
    });

    test("returns 422 when the id is not numeric", async () => {
        resetState();

        const { status, body } = await requestDelete("abc");

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.message).toContain("Validation failed");
    });
});
