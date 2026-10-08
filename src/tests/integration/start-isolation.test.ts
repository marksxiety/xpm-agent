import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

// The real-daemon canary runs in a dedicated child process: pm2 is CommonJS
// and its require cache (PM2_HOME-derived paths) is process-wide, so it cannot
// share a process with the mocked pm2 unit tests. On Windows the child gets
// private named pipes via a patched pm2 paths module plus explicit Daemon
// socket options, so the machine-wide daemon is never contacted.
describe("start isolation canary", () => {
  test(
    "fork children stay isolated across start, restart, reload and resurrect",
    () => {
      const runnerPath = path.join(import.meta.dir, "canary-runner.ts");
      const result = spawnSync(process.execPath, [runnerPath], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120000,
        windowsHide: true,
      });

      if (result.status !== 0) {
        throw new Error(
          `canary failed (status ${result.status})\n${result.stdout?.toString() ?? ""}\n${result.stderr?.toString() ?? ""}`,
        );
      }
      expect(result.stdout?.toString()).toContain("canary: start/restart/reload/resurrect");
    },
    180000,
  );
});
