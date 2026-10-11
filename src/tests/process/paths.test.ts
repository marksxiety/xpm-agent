import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeProcessConfigAsync, type SanitizeInput } from "../../utils/sanitize";
import { verifyStartPaths } from "../../utils/paths";

const NODE = "C:\\Program Files\\nodejs\\node.exe";

function payloadFor(cwd: string, script: string) {
  return {
    name: "my-app",
    cwd,
    script,
    interpreter: NODE,
  } as unknown as SanitizeInput;
}

describe("verifyStartPaths (cwd vs script distinction)", () => {
  test("missing cwd reports field cwd and skips the script check", async () => {
    const missing = join(tmpdir(), `xpm-missing-${Date.now()}`);
    const issues = await verifyStartPaths(
      { cwd: missing, script: "server.js", targetOs: process.platform as "win32" | "linux" },
      { platform: process.platform },
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("cwd");
    expect(issues[0]?.message).toContain("does not exist or is not a directory");
  });

  test("cwd that is a file reports field cwd", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xpm-cwd-file-"));
    const fileAsCwd = join(dir, "not-a-dir");
    await writeFile(fileAsCwd, "x");
    try {
      const issues = await verifyStartPaths(
        { cwd: fileAsCwd, script: "server.js", targetOs: process.platform as "win32" | "linux" },
        { platform: process.platform },
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]?.field).toBe("cwd");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("existing cwd with missing script reports field script", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xpm-good-cwd-"));
    try {
      const issues = await verifyStartPaths(
        { cwd: dir, script: "does-not-exist.js", targetOs: process.platform as "win32" | "linux" },
        { platform: process.platform },
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]?.field).toBe("script");
      expect(issues[0]?.message).toContain("was not found inside cwd");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("existing cwd with existing script reports no issues", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xpm-ok-"));
    await writeFile(join(dir, "server.js"), "console.log(1)");
    try {
      const issues = await verifyStartPaths(
        { cwd: dir, script: "server.js", targetOs: process.platform as "win32" | "linux" },
        { platform: process.platform },
      );

      expect(issues).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("script that is a directory reports field script", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xpm-script-dir-"));
    await mkdir(join(dir, "subdir"));
    try {
      const issues = await verifyStartPaths(
        { cwd: dir, script: "subdir", targetOs: process.platform as "win32" | "linux" },
        { platform: process.platform },
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]?.field).toBe("script");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("skips the check when targetOs differs from the host", async () => {
    const other = process.platform === "win32" ? "linux" : "win32";
    const issues = await verifyStartPaths(
      { cwd: "/nonexistent-cwd", script: "server.js", targetOs: other as "win32" | "linux" },
      { platform: process.platform },
    );

    expect(issues).toEqual([]);
  });
});

describe("sanitizeProcessConfigAsync cwd vs script", () => {
  test("missing cwd returns 422-style cwd issue and null options", async () => {
    const missing = join(tmpdir(), `xpm-async-missing-${Date.now()}`);
    const { options, issues } = await sanitizeProcessConfigAsync(payloadFor(missing, "server.js"));

    expect(options).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("cwd");
  });

  test("existing cwd with missing script returns script issue", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xpm-async-script-"));
    try {
      const { options, issues } = await sanitizeProcessConfigAsync(payloadFor(dir, "missing.js"));

      expect(options).toBeNull();
      expect(issues).toHaveLength(1);
      expect(issues[0]?.field).toBe("script");
      expect(issues[0]?.message).toBe(`script 'missing.js' was not found inside cwd '${dir}'`);
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
