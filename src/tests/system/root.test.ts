import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AgentStatusResponse } from "../../types";

const { systemController } = await import("../../controller/system.controller");
const { createApp } = await import("../../index");

describe("system root status controller", () => {
    test("returns the agent banner with its process id", () => {
        const response = systemController.getRootStatus();

        expect(response).toEqual({ success: true, message: "XPM agent is running", info: { pid: process.pid } });
    });
});

describe("root route", () => {
    test("returns 200 with the agent banner", async () => {
        const response = await createApp().handle(new Request("http://localhost/", { method: "GET" }));
        const body = (await response.json()) as AgentStatusResponse;

        expect(response.status).toBe(200);
        expect(body).toEqual({ success: true, message: "XPM agent is running", info: { pid: process.pid } });
    });
});

describe("root route with AUTH_TOKEN configured", () => {
    beforeEach(() => {
        process.env.AUTH_TOKEN = "secret-token";
    });

    afterEach(() => {
        delete process.env.AUTH_TOKEN;
    });

    test("stays public without a token", async () => {
        const response = await createApp().handle(new Request("http://localhost/", { method: "GET" }));
        const body = (await response.json()) as AgentStatusResponse;

        expect(response.status).toBe(200);
        expect(body).toEqual({ success: true, message: "XPM agent is running", info: { pid: process.pid } });
    });
});
