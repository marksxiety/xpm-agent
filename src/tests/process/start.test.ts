import { describe, expect, mock, test } from "bun:test";
import type { ProcessDescription, StartOptions, Proc } from "pm2";
import type { ApiResponse, ProcessSummary } from "../../types";
import { StartIssue } from "../../types/inspect";

const state = {
    started: [] as ProcessDescription[],
    list: [] as ProcessDescription[],
    startError: null as Error | null,
    listError: null as Error | null,
    connectError: null as Error | null,
    startOpts: null as StartOptions | null,
};

mock.module("pm2", () => ({
    default: {
        connect(cb: (err?: Error | null) => void) { cb(state.connectError); },
        disconnect() { },
        start(opts: StartOptions, cb: (err?: Error | null, procs?: Proc | Proc[]) => void) {
            state.startOpts = opts;
            cb(state.startError, state.started);
        },
        list(cb: (err?: Error | null, list?: ProcessDescription[]) => void) {
            cb(state.listError, state.list);
        },
    },
}));

const { pm2Service } = await import("../../services/pm2.service");
const { createApp } = await import("../../index");

const VALID_PAYLOAD: StartOptions = {
    name: "my-app",
    namespace: "example",
    cwd: "C:\\Example\\Application",
    script: ".output/server/index.mjs",
    args: ["--port", "3000"],
    interpreter: "C:\\Program Files\\nodejs\\node.exe",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    watch: false,
};

function resetState() {
    state.started = [];
    state.list = [];
    state.startError = null;
    state.listError = null;
    state.connectError = null;
    state.startOpts = null;
}

async function postStart(payload: object): Promise<{ status: number; body: ApiResponse }> {
    const response = await createApp().handle(
        new Request("http://localhost/pm2/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        }),
    );
    return { status: response.status, body: (await response.json()) as ApiResponse };
}

describe("pm2 start service", () => {
    test("starts the process with time: true so logs are timestamped", async () => {
        resetState();
        state.started = [{ name: "my-app" }];

        await pm2Service.startProcess(VALID_PAYLOAD);

        expect(state.startOpts?.time).toBe(true);
    });

    test("forces time: true even when the payload sets time: false", async () => {
        resetState();
        state.started = [{ name: "my-app" }];

        await pm2Service.startProcess({ ...VALID_PAYLOAD, time: false });

        expect(state.startOpts?.time).toBe(true);
    });

    test("returns the launched process when pm2 does not report a pm_id", async () => {
        resetState();
        state.started = [{ name: "my-app" }];

        const response = await pm2Service.startProcess(VALID_PAYLOAD);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process started successfully");
        expect(response.info).toHaveLength(1);
        expect((response.info as ProcessSummary[])?.[0].name).toBe("my-app");
    });

    test("returns 400 when PM2 fails to start the process", async () => {
        resetState();
        state.startError = new Error("Script not found");

        const response = await pm2Service.startProcess(VALID_PAYLOAD);

        expect(response.success).toBe(false);
        expect(response.status).toBe(400);
        expect(response.code).toBe("SCRIPT_NOT_FOUND");
        expect(response.message).toBe("Script not found — check the 'script' path in your request");
    });

    test("returns 422 with the issue list when name is empty", async () => {
        resetState();

        const response = await pm2Service.startProcess({ ...VALID_PAYLOAD, name: "" });

        expect(response.success).toBe(false);
        expect(response.status).toBe(422);
        expect(response.code).toBe("INVALID_PROCESS_CONFIGURATION");
        expect(response.message).toBe("Invalid process configuration");
        expect(response.info as unknown as StartIssue[]).toEqual([{ field: "name", message: "name is required and cannot be empty" }]);
    });

    test("returns 422 with the issue list when script is empty", async () => {
        resetState();

        const response = await pm2Service.startProcess({ ...VALID_PAYLOAD, script: "" });

        expect(response.success).toBe(false);
        expect(response.status).toBe(422);
        expect(response.code).toBe("INVALID_PROCESS_CONFIGURATION");
        expect(response.message).toBe("Invalid process configuration");
        expect(response.info as unknown as StartIssue[]).toEqual([{ field: "script", message: "script is required and cannot be empty" }]);
    });

    test("returns 422 with the issue list when instances is a string other than 'max'", async () => {
        resetState();

        const response = await pm2Service.startProcess({
            ...VALID_PAYLOAD,
            // @ts-expect-error Testing runtime validation for an invalid type
            instances: "2",
        });

        expect(response.success).toBe(false);
        expect(response.status).toBe(422);
        expect(response.code).toBe("INVALID_PROCESS_CONFIGURATION");
        expect(response.message).toBe("Invalid process configuration");
        expect(response.info as unknown as StartIssue[]).toEqual([
            { field: "instances", message: "instances must be a positive integer or 'max'" },
        ]);
    });

    test("returns 422 with the issue list when instances is zero", async () => {
        resetState();

        const response = await pm2Service.startProcess({ ...VALID_PAYLOAD, instances: 0 });

        expect(response.success).toBe(false);
        expect(response.status).toBe(422);
        expect(response.code).toBe("INVALID_PROCESS_CONFIGURATION");
        expect(response.message).toBe("Invalid process configuration");
        expect(response.info as unknown as StartIssue[]).toEqual([
            { field: "instances", message: "instances must be a positive integer or 'max'" },
        ]);
    });

    test("returns 422 with the issue list when instances exceeds 1 in fork mode", async () => {
        resetState();

        const response = await pm2Service.startProcess({ ...VALID_PAYLOAD, exec_mode: "fork", instances: 2 });

        expect(response.success).toBe(false);
        expect(response.status).toBe(422);
        expect(response.code).toBe("INVALID_PROCESS_CONFIGURATION");
        expect(response.message).toBe("Invalid process configuration");
        expect(response.info as unknown as StartIssue[]).toEqual([
            { field: "instances", message: "'instances' has no effect in fork mode — set exec_mode to 'cluster' if supported" },
        ]);
    });

    test("returns only the launched processes filtered from the list call when pm_id is present", async () => {
        resetState();
        state.started = [{ pm_id: 3, name: "my-app" }];
        state.list = [{ pm_id: 3, name: "my-app" }];

        const response = await pm2Service.startProcess(VALID_PAYLOAD);

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 process started successfully");
        expect(response.info as ProcessSummary[]).toHaveLength(1);
        expect((response.info as ProcessSummary[])?.[0].pm_id).toBe(3);
        expect((response.info as ProcessSummary[])?.[0].name).toBe("my-app");
    });

    test("returns the launched process when pm_id is only present in pm2_env", async () => {
        resetState();
        state.started = [{ name: "my-app", pm2_env: { pm_id: 3 } as ProcessDescription["pm2_env"] }];
        state.list = [{ pm_id: 3, name: "my-app" }];

        const response = await pm2Service.startProcess(VALID_PAYLOAD);

        expect(response.success).toBe(true);
        expect(response.info as ProcessSummary[]).toHaveLength(1);
        expect((response.info as ProcessSummary[])?.[0].pm_id).toBe(3);
    });

    test("returns the list error when the post-start list call fails", async () => {
        resetState();
        state.started = [{ pm_id: 3, name: "my-app" }];
        state.listError = new Error("PM2 daemon not running");

        const response = await pm2Service.startProcess(VALID_PAYLOAD);

        expect(response.success).toBe(false);
        expect(response.status).toBe(503);
        expect(response.code).toBe("PM2_DAEMON_UNAVAILABLE");
        expect(response.message).toBe("Cannot connect to PM2 daemon");
    });

    test("returns 503 when the PM2 daemon is unreachable", async () => {
        resetState();
        state.connectError = new Error("connect ECONNREFUSED 127.0.0.1:4444");

        const response = await pm2Service.startProcess(VALID_PAYLOAD);

        expect(response.success).toBe(false);
        expect(response.status).toBe(503);
        expect(response.code).toBe("PM2_DAEMON_UNAVAILABLE");
        expect(response.message).toBe("Cannot connect to PM2 daemon");
    });

    test("returns 500 with the raw message on an unexpected PM2 start error", async () => {
        resetState();
        state.startError = new Error("Unexpected error");

        const response = await pm2Service.startProcess(VALID_PAYLOAD);

        expect(response.success).toBe(false);
        expect(response.status).toBe(500);
        expect(response.code).toBe("PM2_OPERATION_FAILED");
        expect(response.message).toBe("PM2 operation failed: Unexpected error");
    });
});

describe("pm2 start route", () => {
    test("returns 200 with the launched process when the payload is valid", async () => {
        resetState();
        state.started = [{ pm_id: 3, name: "my-app" }];
        state.list = [{ pm_id: 3, name: "my-app" }];

        const { status, body } = await postStart(VALID_PAYLOAD);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.info).toHaveLength(1);
        expect((body.info as { pm_id: number; name: string }[])[0].pm_id).toBe(3);
        expect((body.info as { pm_id: number; name: string }[])[0].name).toBe("my-app");
    });

    test("returns 200 with a posix interpreter on a linux target", async () => {
        resetState();
        state.started = [{ pm_id: 3, name: "my-app" }];
        state.list = [{ pm_id: 3, name: "my-app" }];

        const { status, body } = await postStart({ ...VALID_PAYLOAD, targetOs: "linux", interpreter: "/usr/bin/node" });

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect((body.info as { pm_id: number; name: string }[])[0].pm_id).toBe(3);
    });

    test("returns 422 when a required field (script) is missing", async () => {
        resetState();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { script: _script, ...withoutScript } = VALID_PAYLOAD;

        const { status, body } = await postStart(withoutScript);

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.code).toBe("VALIDATION_FAILED");
        expect(body.message).toContain("Validation failed");
    });

    test("returns 422 when instances is a string other than 'max'", async () => {
        resetState();

        const { status, body } = await postStart({ ...VALID_PAYLOAD, instances: "2" });

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.code).toBe("VALIDATION_FAILED");
        expect(body.message).toContain("Validation failed");
    });

    test("returns 422 with the issue list when name is empty", async () => {
        resetState();

        const { status, body } = await postStart({ ...VALID_PAYLOAD, name: "" });

        expect(status).toBe(422);
        expect(body.success).toBe(false);
        expect(body.code).toBe("INVALID_PROCESS_CONFIGURATION");
        expect(body.message).toBe("Invalid process configuration");
        expect(body.info).toEqual([{ field: "name", message: "name is required and cannot be empty" }]);
    });

    test("returns 400 when PM2 reports script not found", async () => {
        resetState();
        state.startError = new Error("Script not found");

        const { status, body } = await postStart(VALID_PAYLOAD);

        expect(status).toBe(400);
        expect(body.success).toBe(false);
        expect(body.code).toBe("SCRIPT_NOT_FOUND");
        expect(body.message).toBe("Script not found — check the 'script' path in your request");
    });

    test("returns 503 when the PM2 daemon is unreachable", async () => {
        resetState();
        state.connectError = new Error("connect ECONNREFUSED 127.0.0.1:4444");

        const { status, body } = await postStart(VALID_PAYLOAD);

        expect(status).toBe(503);
        expect(body.success).toBe(false);
        expect(body.code).toBe("PM2_DAEMON_UNAVAILABLE");
        expect(body.message).toBe("Cannot connect to PM2 daemon");
    });
});