import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ApiResponse } from "../../types";
import { createApp } from "../../index";

const TEST_TOKEN = "secret-token";

async function getHealth(token?: string): Promise<{ status: number; body: ApiResponse }> {
  const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};
  const response = await createApp().handle(new Request("http://localhost/pm2/health", { headers }));
  return { status: response.status, body: (await response.json()) as ApiResponse };
}

describe("without AUTH_TOKEN configured", () => {
  beforeEach(() => {
    delete process.env.AUTH_TOKEN;
  });

  afterEach(() => {
    delete process.env.AUTH_TOKEN;
  });

  test("allows requests without a token", async () => {
    const { status, body } = await getHealth();

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  test("allows requests even when a bearer header is present", async () => {
    const { status, body } = await getHealth("any-token");

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

describe("with AUTH_TOKEN configured", () => {
  beforeEach(() => {
    process.env.AUTH_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    delete process.env.AUTH_TOKEN;
  });

  test("returns 401 when a token is configured but not provided", async () => {
    const { status, body } = await getHealth();

    expect(status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(body.message).toBe("Unauthorized: missing or invalid authentication token");
  });

  test("returns 401 when the provided token does not match", async () => {
    const { status, body } = await getHealth("wrong-token");

    expect(status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("returns 200 when the provided token matches", async () => {
    const { status, body } = await getHealth(TEST_TOKEN);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  test("returns 401 for a non-bearer Authorization header", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/pm2/health", {
        headers: { authorization: TEST_TOKEN },
      }),
    );

    expect(response.status).toBe(401);
  });
});