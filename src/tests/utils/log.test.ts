import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";

import { pm2LogsDir, resolveLogFiles } from "../../utils/log";

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