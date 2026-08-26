import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";

import { pm2LogsDir, resolveLogFiles, tailLines, DEFAULT_TAIL_LINES, MAX_TAIL_LINES } from "../../utils/log";

const FIXED_PM2_HOME = "C:\\Apps\\DPR\\.pm2";

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