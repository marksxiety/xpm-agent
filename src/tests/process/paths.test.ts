import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeProcessConfigAsync, type SanitizeInput } from "../../utils/sanitize";
import { verifyStartPaths } from "../../utils/paths";
import type { TargetOs } from "../../utils/inspect";

const HOST_OS = process.platform as TargetOs;

function payloadFor(cwd: string, script: string) {
  return {
    name: "my-app",
    cwd,
    script,
    interpreter: process.execPath,
    targetOs: HOST_OS,
  } as unknown as SanitizeInput;
}

describe("verifyStartPaths (cwd existence)", () => {
  test("missing cwd reports field cwd", async () => {
    const missing = join(tmpdir(), `xpm-missing-${Date.now()}`);
    const issues = await verifyStartPaths({ cwd: missing, targetOs: HOST_OS }, { platform: HOST_OS });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("cwd");
    expect(issues[0]?.message).toContain("does not exist or is not a directory");
  });

  test("cwd that is a file reports field cwd", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xpm-cwd-file-"));
    const fileAsCwd = join(dir, "not-a-dir");
    await writeFile(fileAsCwd, "x");
    try {
      const issues = await verifyStartPaths({ cwd: fileAsCwd, targetOs: HOST_OS }, { platform: HOST_OS });

      expect(issues).toHaveLength(1);
      expect(issues[0]?.field).toBe("cwd");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("existing cwd reports no issues", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xpm-ok-"));
    try {
      const issues = await verifyStartPaths({ cwd: dir, targetOs: HOST_OS }, { platform: HOST_OS });

      expect(issues).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("skips the check when targetOs differs from the host", async () => {
    const other: TargetOs = HOST_OS === "win32" ? "linux" : "win32";
    const issues = await verifyStartPaths({ cwd: "/nonexistent-cwd", targetOs: other }, { platform: HOST_OS });

    expect(issues).toEqual([]);
  });
});

describe("sanitizeProcessConfigAsync cwd", () => {
  test("missing cwd returns 422-style cwd issue and null options", async () => {
    const missing = join(tmpdir(), `xpm-async-missing-${Date.now()}`);
    const { options, issues } = await sanitizeProcessConfigAsync(payloadFor(missing, "server.js"));

    expect(options).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("cwd");
  });

  test("existing cwd with a missing script still returns options (script check left to PM2)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xpm-async-script-"));
    try {
      const { options, issues } = await sanitizeProcessConfigAsync(payloadFor(dir, "missing.js"));

      expect(issues).toEqual([]);
      expect(options?.script).toBe("missing.js");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("shape errors still win over filesystem errors", async () => {
    const { options, issues } = await sanitizeProcessConfigAsync(payloadFor("relative\\dir", ""));
    const fields = issues.map((issue) => issue.field);

    expect(options).toBeNull();
    expect(fields).toContain("cwd");
    expect(fields).toContain("script");
  });
});
