import { describe, expect, test } from "bun:test";

import { pm2LogsDir, resolveLogFiles } from "../../utils/log";

describe("pm2LogsDir", () => {
  test("returns the correct PM2 logs directory", () => {
    const FIXED_PM2_HOME = "C:\\Apps\\DPR\\.pm2";
    process.env.PM2_HOME = FIXED_PM2_HOME;
    const logsDir = pm2LogsDir();

    expect(logsDir).toBe(`${FIXED_PM2_HOME}\\logs`);
  });
});