import { describe, expect, test } from "bun:test";
import type { ApiResponse } from "../../types";

const { pm2Service } = await import("../../services/pm2.service");
const { createApp } = await import("../../index");

describe("pm2 health service", () => {
    test("returns an ok health status with uptime and timestamp", async () => {
        const response = await pm2Service.healthCheck();

        expect(response.success).toBe(true);
        expect(response.message).toBe("PM2 health check passed");
        expect(response.info?.status).toBe("ok");
        expect(typeof response.info?.uptime).toBe("number");
        expect(typeof response.info?.timestamp).toBe("number");
    });
});

describe("pm2 health route", () => {
    test("returns 200 with an ok health status", async () => {
        const response = await createApp().handle(new Request("http://localhost/pm2/health", { method: "GET" }));
        const body = (await response.json()) as ApiResponse & { info: { status: string } };

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.info?.status).toBe("ok");
    });
});