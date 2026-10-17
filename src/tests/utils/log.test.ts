import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

import {
  pm2LogsDir,
  resolveLogFiles,
  tailLines,
  logStreamBytes,
  resolveRotatedLogFiles,
  logDirMetrics,
  DEFAULT_TAIL_LINES,
  MAX_TAIL_LINES,
} from "../../utils/log";

const FIXED_PM2_HOME = "C:\\Apps\\.pm2";

function expectedLogFile(base: string): string {
  return path.join(FIXED_PM2_HOME, "logs", `${base}.log`);
}

describe("pm2LogsDir", () => {
  test("returns the correct PM2 logs directory", () => {
    process.env.PM2_HOME = FIXED_PM2_HOME;
    const logsDir = pm2LogsDir();

    expect(logsDir).toBe(path.join(FIXED_PM2_HOME, "logs"));
  });
});

describe("resolveLogFiles", () => {
  beforeEach(() => {
    process.env.PM2_HOME = FIXED_PM2_HOME;
  });

  test("returns error log file paths based on passed parameters", () => {
    const input = { name: "my-app", namespace: "my-namespace" };

    const { error } = resolveLogFiles(input);
    expect(error).toBe(expectedLogFile("my-namespace-my-app-error"));
  });

  test("returns output log file paths based on passed parameters", () => {
    const input = { name: "my-app", namespace: "my-namespace" };

    const { output } = resolveLogFiles(input);
    expect(output).toBe(expectedLogFile("my-namespace-my-app-out"));
  });

  test("return default log file paths when name and namespace are not provided", () => {
    const input = {};

    const { error, output } = resolveLogFiles(input);
    expect(error).toBe(expectedLogFile("default-default-error"));
    expect(output).toBe(expectedLogFile("default-default-out"));
  });

  test("return default log file paths when name is not provided", () => {
    const input = { namespace: "my-namespace" };

    const { error, output } = resolveLogFiles(input);
    expect(error).toBe(expectedLogFile("my-namespace-default-error"));
    expect(output).toBe(expectedLogFile("my-namespace-default-out"));
  });

  test("return default log file paths when namespace is not provided", () => {
    const input = { name: "my-app" };

    const { error, output } = resolveLogFiles(input);
    expect(error).toBe(expectedLogFile("default-my-app-error"));
    expect(output).toBe(expectedLogFile("default-my-app-out"));
  });
});

describe("tailLines", () => {
  test("returns the last N lines when tail is provided", () => {
    const content = "line1\nline2\nline3\nline4\nline5\n";

    expect(tailLines(content, 3)).toEqual(["line3", "line4", "line5"]);
  });

  test("handles a trailing newline without producing an empty line", () => {
    const content = "a\nb\nc\n";

    expect(tailLines(content, 2)).toEqual(["b", "c"]);
  });

  test("handles Windows CRLF line endings", () => {
    const content = "a\r\nb\r\nc\r\n";

    expect(tailLines(content, 2)).toEqual(["b", "c"]);
  });

  test("returns all lines when content has fewer lines than tail", () => {
    const content = "only-one-line";

    expect(tailLines(content, 5)).toEqual(["only-one-line"]);
  });

  test("returns empty array for empty content", () => {
    expect(tailLines("", 5)).toEqual([]);
  });

  test("returns up to MAX_TAIL_LINES even when tail exceeds it", () => {
    const content = Array.from({ length: MAX_TAIL_LINES + 100 }, (_, index) => `line${index + 1}`).join("\n");

    const lines = tailLines(content, MAX_TAIL_LINES + 100);

    expect(lines).toHaveLength(MAX_TAIL_LINES);
    expect(lines[0]).toBe("line101");
  });

  test("returns DEFAULT_TAIL_LINES when tail is omitted", () => {
    const content = Array.from({ length: DEFAULT_TAIL_LINES + 10 }, (_, index) => `line${index + 1}`).join("\n");

    const lines = tailLines(content);

    expect(lines).toHaveLength(DEFAULT_TAIL_LINES);
    expect(lines[0]).toBe("line11");
  });
});

const SIZE_ROOT = path.join(os.tmpdir(), `xpm-log-size-${Date.now()}`);
const SIZE_LOGS = path.join(SIZE_ROOT, "logs");
const SIZE_OUT = path.join(SIZE_LOGS, "default-my-app-out.log");
const SIZE_OUT_ROTATED = path.join(SIZE_LOGS, "default-my-app-out__2026-01-01_00-00-00.log");
const SIZE_OUT_ROTATED_GZ = path.join(SIZE_LOGS, "default-my-app-out__2026-01-02_00-00-00.log.gz");
const SIZE_ERR = path.join(SIZE_LOGS, "default-my-app-error.log");

describe("logStreamBytes", () => {
  beforeEach(async () => {
    await fs.mkdir(SIZE_LOGS, { recursive: true });
    await fs.writeFile(SIZE_OUT, "a".repeat(100), "utf8");
    await fs.writeFile(SIZE_OUT_ROTATED, "b".repeat(40), "utf8");
    await fs.writeFile(SIZE_OUT_ROTATED_GZ, "c".repeat(10), "utf8");
    await fs.writeFile(SIZE_ERR, "d".repeat(5), "utf8");
  });

  afterAll(async () => {
    await fs.rm(SIZE_ROOT, { recursive: true, force: true });
  });

  test("sums the current file with all rotated siblings (including .gz)", async () => {
    expect(await logStreamBytes(SIZE_OUT)).toBe(150);
  });

  test("sums only the matching stream", async () => {
    expect(await logStreamBytes(SIZE_ERR)).toBe(5);
  });

  test("returns 0 for a missing path or undefined input", async () => {
    expect(await logStreamBytes(path.join(SIZE_LOGS, "does-not-exist.log"))).toBe(0);
    expect(await logStreamBytes(undefined)).toBe(0);
  });
});

describe("resolveRotatedLogFiles", () => {
  beforeEach(async () => {
    await fs.mkdir(SIZE_LOGS, { recursive: true });
    await fs.writeFile(SIZE_OUT, "a".repeat(100), "utf8");
    await fs.writeFile(SIZE_OUT_ROTATED, "b".repeat(40), "utf8");
    await fs.writeFile(SIZE_OUT_ROTATED_GZ, "c".repeat(10), "utf8");
  });

  afterAll(async () => {
    await fs.rm(SIZE_ROOT, { recursive: true, force: true });
  });

  test("returns rotated siblings but not the current file", async () => {
    const rotated = (await resolveRotatedLogFiles(SIZE_OUT)).map((file) => path.basename(file)).sort();

    expect(rotated).toEqual([
      "default-my-app-out__2026-01-01_00-00-00.log",
      "default-my-app-out__2026-01-02_00-00-00.log.gz",
    ]);
  });

  test("returns an empty list when the directory does not exist", async () => {
    expect(await resolveRotatedLogFiles(path.join(SIZE_LOGS, "nope", "x.log"))).toEqual([]);
  });
});

describe("logDirMetrics", () => {
  afterAll(async () => {
    await fs.rm(SIZE_ROOT, { recursive: true, force: true });
  });

  test("totals every .log/.log.gz file in the PM2 logs directory", async () => {
    await fs.mkdir(SIZE_LOGS, { recursive: true });
    await fs.writeFile(SIZE_OUT, "a".repeat(100), "utf8");
    await fs.writeFile(SIZE_OUT_ROTATED, "b".repeat(40), "utf8");
    await fs.writeFile(SIZE_OUT_ROTATED_GZ, "c".repeat(10), "utf8");
    await fs.writeFile(SIZE_ERR, "d".repeat(5), "utf8");
    await fs.writeFile(path.join(SIZE_LOGS, "not-a-log.txt"), "x".repeat(999), "utf8");
    process.env.PM2_HOME = SIZE_ROOT;

    const metrics = await logDirMetrics();

    expect(metrics).toEqual({ totalBytes: 155, fileCount: 4 });
  });

  test("returns zeros when the logs directory does not exist", async () => {
    process.env.PM2_HOME = path.join(SIZE_ROOT, "missing-home");

    expect(await logDirMetrics()).toEqual({ totalBytes: 0, fileCount: 0 });
  });
});