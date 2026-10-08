import { describe, expect, test } from "bun:test";
import {
  isReservedEnvKey,
  sanitizeEnv,
  sanitizeProcessConfig,
  type SanitizeInput,
} from "../../utils/sanitize";

const VALID_PAYLOAD = {
  name: "my-app",
  script: "C:\\apps\\index.js",
  interpreter: "C:\\Program Files\\nodejs\\node.exe",
  cwd: "C:\\apps",
};

const sanitize = (payload: Record<string, unknown>) =>
  sanitizeProcessConfig(payload as unknown as SanitizeInput);

describe("sanitizeEnv", () => {
  test("keeps regular key-value pairs", () => {
    expect(sanitizeEnv({ NODE_ENV: "production", PORT: "3000" })).toEqual({
      NODE_ENV: "production",
      PORT: "3000",
    });
  });

  test("strips reserved PM2 keys and prefixes", () => {
    expect(
      sanitizeEnv({
        KEEP: "yes",
        pm_id: "0",
        pm_exec_path: "C:\\evil.js",
        PM2_HOME: "C:\\pm2",
        axm_monitor: "{}",
        name: "evil",
        namespace: "XPM",
        status: "online",
        exec_mode: "cluster",
        NODE_APP_INSTANCE: "1",
        unique_id: "abc",
      }),
    ).toEqual({ KEEP: "yes" });
  });

  test("flags reserved keys", () => {
    expect(isReservedEnvKey("pm_id")).toBe(true);
    expect(isReservedEnvKey("PM2_NAMESPACE")).toBe(true);
    expect(isReservedEnvKey("axm_actions")).toBe(true);
    expect(isReservedEnvKey("NODE_APP_INSTANCE")).toBe(true);
    expect(isReservedEnvKey("PORT")).toBe(false);
    expect(isReservedEnvKey("AUTH_TOKEN")).toBe(false);
  });
});

describe("sanitizeProcessConfig", () => {
  test("returns null options with issues when the configuration is invalid", () => {
    const { options, issues } = sanitize({ ...VALID_PAYLOAD, cwd: "relative\\dir" });

    expect(options).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("cwd");
  });

  test("defaults an omitted namespace to 'default'", () => {
    const { options } = sanitize(VALID_PAYLOAD);

    expect(options?.namespace).toBe("default");
    expect(options?.env?.namespace).toBe("default");
  });

  test("defaults an empty namespace to 'default'", () => {
    const { options } = sanitize({ ...VALID_PAYLOAD, namespace: "" });

    expect(options?.namespace).toBe("default");
    expect(options?.env?.namespace).toBe("default");
  });

  test("defaults a whitespace-only namespace to 'default'", () => {
    const { options } = sanitize({ ...VALID_PAYLOAD, namespace: "   " });

    expect(options?.namespace).toBe("default");
    expect(options?.env?.namespace).toBe("default");
  });

  test("trims a namespace", () => {
    const { options } = sanitize({ ...VALID_PAYLOAD, namespace: "  staging  " });

    expect(options?.namespace).toBe("staging");
  });

  test("mirrors the canonical namespace over any payload env.namespace", () => {
    const { options } = sanitize({
      ...VALID_PAYLOAD,
      namespace: "example",
      env: { FOO: "bar", namespace: "XPM" },
    });

    expect(options?.env).toEqual({ FOO: "bar", namespace: "example" });
  });

  test("denies every inherited variable via filter_env", () => {
    process.env.XPM_LEAK_TEST = "1";
    try {
      const { options } = sanitize(VALID_PAYLOAD);

      expect(options?.filter_env).toEqual(Object.keys(process.env));
      expect(options?.filter_env).toContain("XPM_LEAK_TEST");
    } finally {
      delete process.env.XPM_LEAK_TEST;
    }
  });

  test("does not inherit the agent environment", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.XPM_LEAK_TEST = "1";
    process.env.NODE_ENV = "production";
    try {
      const { options } = sanitize(VALID_PAYLOAD);

      expect(options?.env).toEqual({ namespace: "default" });
    } finally {
      delete process.env.XPM_LEAK_TEST;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("strips pm2 metadata keys from the payload env", () => {
    const { options } = sanitize({
      ...VALID_PAYLOAD,
      env: { FOO: "bar", max_restarts: "99", node_version: "1.2.3" },
    });

    expect(options?.env).toEqual({ FOO: "bar", namespace: "default" });
  });

  test("treats reserved keys case-insensitively", () => {
    expect(isReservedEnvKey("MAX_RESTARTS")).toBe(true);
    expect(isReservedEnvKey("Max_Restarts")).toBe(true);
    expect(isReservedEnvKey("pm2_home")).toBe(true);
    expect(isReservedEnvKey("MY_APP_FLAG")).toBe(false);
  });

  test("strips case-variant reserved keys from the payload env", () => {
    const { options } = sanitize({
      ...VALID_PAYLOAD,
      env: { FOO: "bar", MAX_RESTARTS: "99", MIN_UPTIME: "1s", Min_Uptime: "1s" },
    });

    expect(options?.env).toEqual({ FOO: "bar", namespace: "default" });
  });

  test("strips reserved keys from the payload env", () => {
    const { options } = sanitize({
      ...VALID_PAYLOAD,
      env: { FOO: "bar", pm_id: "0", name: "evil", NODE_APP_INSTANCE: "1" },
    });

    expect(options?.env).toEqual({ FOO: "bar", namespace: "default" });
  });

  test("forces time: true even when the payload disables it", () => {
    const { options } = sanitize({ ...VALID_PAYLOAD, time: false });

    expect(options?.time).toBe(true);
  });

  test("drops the API-only targetOs field", () => {
    const { options } = sanitize({
      ...VALID_PAYLOAD,
      cwd: "/srv/apps",
      interpreter: "/usr/bin/node",
      targetOs: "linux",
    });

    expect(options).not.toBeNull();
    expect(options as Record<string, unknown>).not.toHaveProperty("targetOs");
  });

  test("normalizes min_uptime duration strings to milliseconds", () => {
    const { options } = sanitize({ ...VALID_PAYLOAD, min_uptime: "10s" });

    expect(options?.min_uptime).toBe(10000);
  });

  test("converts max_restarts: 0 into autorestart: false and drops max_restarts", () => {
    const { options } = sanitize({ ...VALID_PAYLOAD, max_restarts: 0 });

    expect(options?.autorestart).toBe(false);
    expect(options?.max_restarts).toBeUndefined();
  });

  test("keeps a positive max_restarts", () => {
    const { options } = sanitize({ ...VALID_PAYLOAD, max_restarts: 10 });

    expect(options?.max_restarts).toBe(10);
    expect(options?.autorestart).toBeUndefined();
  });

  test("rejects cluster mode for a Bun interpreter", () => {
    const { options, issues } = sanitize({
      ...VALID_PAYLOAD,
      script: "C:\\apps\\index.ts",
      interpreter: "C:\\Program Files\\bun\\bun.exe",
      exec_mode: "cluster",
      instances: 2,
    });

    expect(options).toBeNull();
    expect(issues).toEqual([
      {
        field: "exec_mode",
        message: "cluster mode isn't supported by this interpreter (bun) — use 'fork' instead",
      },
    ]);
  });

  test("allows cluster mode for a Node interpreter", () => {
    const { options, issues } = sanitize({
      ...VALID_PAYLOAD,
      exec_mode: "cluster",
      instances: 2,
    });

    expect(issues).toEqual([]);
    expect(options?.exec_mode).toBe("cluster");
  });

  test("accepts .js scripts with a Bun interpreter (same runtime family)", () => {
    const { options, issues } = sanitize({
      ...VALID_PAYLOAD,
      interpreter: "C:\\Program Files\\bun\\bun.exe",
    });

    expect(issues).toEqual([]);
    expect(options).not.toBeNull();
  });
});
