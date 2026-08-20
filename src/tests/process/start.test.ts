import { describe, expect, mock, test } from "bun:test";
import type { ProcessDescription, StartOptions, Proc } from "pm2";

const state = {
    started: [] as ProcessDescription[],
    list: [] as ProcessDescription[],
    startError: null as Error | null,
};

mock.module("pm2", () => ({
    default: {
        connect(cb: (err?: Error | null) => void) { cb(null); },
        disconnect() { },
        start(_opts: StartOptions, cb: (err?: Error | null, procs?: Proc | Proc[]) => void) {
            cb(state.startError, state.started);
        },
    },
}));

const { pm2Service } = await import("../../services/pm2.service");

describe("pm2 start command", () => {
    test("returns the launched processes from a fresh list call", async () => {
        state.started = [{ name: "example-app" }];

        const response = await pm2Service.startProcess({
            name: "example-app",
            namespace: "example",
            cwd: "C:\\Example\\Application",
            script: ".output/server/index.mjs",
            args: ["--port", "3000"],
            interpreter: "C:\\Program Files\\nodejs\\node.exe",
            exec_mode: "fork",
            instances: 1,
            autorestart: true,
            watch: false,
        });

        expect(response.success).toBe(true);
        expect(response.info).toHaveLength(1);
        expect(response.info?.[0].name).toBe("example-app");
    })

    test("return an error when PM2 fails to start the process", async () => {
        state.started = [];
        state.startError = new Error("Script not found");

        const response = await pm2Service.startProcess({
            name: "example-app",
            namespace: "example",
            cwd: "C:\\Example\\Application",
            script: ".output/server/index.mjs",
            args: ["--port", "3000"],
            interpreter: "C:\\Program Files\\nodejs\\node.exe",
            exec_mode: "fork",
            instances: 1,
            autorestart: true,
            watch: false,
        });

        expect(response.success).toBe(false);
        expect(response.status).toBe(400);
        expect(response.message).toBe("Script not found — check the 'script' path in your request");
    });
});