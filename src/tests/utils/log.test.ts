import { describe, expect, test, beforeEach } from "bun:test";

import { pm2LogsDir, resolveLogFiles } from "../../utils/log";

const FIXED_PM2_HOME = "C:\\Apps\\DPR\\.pm2";

describe("pm2LogsDir", () => {
  test("returns the correct PM2 logs directory", () => {
    process.env.PM2_HOME = FIXED_PM2_HOME;
    const logsDir = pm2LogsDir();

    expect(logsDir).toBe(`${FIXED_PM2_HOME}\\logs`);
  });
});

describe("resolveLogFiles", () => {
    beforeEach(() => {
        process.env.PM2_HOME = FIXED_PM2_HOME;
    });

    test("returns error log file paths based on passed parameters", () => {
        const input = {
            name: "my-app",
            namespace: "my-namespace",
        }
        
        const { error } = resolveLogFiles(input);
        expect(error).toBe(`${process.env.PM2_HOME}\\logs\\my-namespace-my-app-error.log`);
    })

    test("returns output log file paths based on passed parameters", () => {
        const input = {
            name: "my-app",
            namespace: "my-namespace",
        }
        
        const { output } = resolveLogFiles(input);
        expect(output).toBe(`${process.env.PM2_HOME}\\logs\\my-namespace-my-app-out.log`);
    })

    test("return default log file paths when name and namespace are not provided", () => {
        const input = {}

        const { error, output } = resolveLogFiles(input);
        expect(error).toBe(`${process.env.PM2_HOME}\\logs\\default-default-error.log`);
        expect(output).toBe(`${process.env.PM2_HOME}\\logs\\default-default-out.log`);
    })

    test("return default log file paths when name is not provided", () => {
        const input = {
            namespace: "my-namespace"
        }

        const { error, output } = resolveLogFiles(input);
        expect(error).toBe(`${process.env.PM2_HOME}\\logs\\my-namespace-default-error.log`);
        expect(output).toBe(`${process.env.PM2_HOME}\\logs\\my-namespace-default-out.log`);
    })

    test("return default log file paths when namespace is not provided", () => {
        const input = {
            name: "my-app",
        }

        const { error, output } = resolveLogFiles(input);
        expect(error).toBe(`${process.env.PM2_HOME}\\logs\\default-my-app-error.log`);
        expect(output).toBe(`${process.env.PM2_HOME}\\logs\\default-my-app-out.log`);
    })
});