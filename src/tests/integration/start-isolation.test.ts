import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertIsolatedEnvironment,
  cleanupCanary,
  configureIsolatedPm2,
  prepareAppDir,
  startCanaryChild,
  waitForEnvDump,
} from "./helpers/canary";

// One isolated PM2_HOME per file: PM2 reads PM2_HOME at require time and, on
// Windows, hardcodes the daemon's named pipes unless PM2_DAEMON_*_PORT is set.
const context = configureIsolatedPm2("canary");
process.env.CANARY_SECRET = `canary-secret-${context.runId}`;

// Present in the daemon's env, deliberately absent from the agent/test process.
const DAEMON_ONLY_SECRET = `daemon-only-${context.runId}`;

async function readDaemonPid(timeoutMs = 15000): Promise<string> {
  const pidFile = path.join(context.homeDir, "pm2.pid");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return (await fs.readFile(pidFile, "utf8")).trim();
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error(`Timed out waiting for ${pidFile}`);
}

describe("start isolation canary", () => {
  let daemonPid: string;

  beforeAll(async () => {
    await prepareAppDir(context);

    // Launch the daemon through a helper process so it inherits
    // DAEMON_ONLY_SECRET, a variable the agent process never sees.
    const helperPath = path.join(import.meta.dir, "helpers", "launch-daemon.ts");
    const result = spawnSync(process.execPath, [helperPath], {
      env: { ...process.env, DAEMON_ONLY_SECRET },
      cwd: context.appDir,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
    if (result.status !== 0) {
      throw new Error(`daemon helper failed (${result.status}): ${result.stderr?.toString() ?? ""}`);
    }
    daemonPid = await readDaemonPid();
  });

  afterAll(async () => {
    await cleanupCanary(context);
  });

  test(
    "a fork child inherits only its payload env plus PM2 metadata",
    async () => {
      expect(process.env.DAEMON_ONLY_SECRET).toBeUndefined();

      await startCanaryChild(context);
      const environment = await waitForEnvDump(context);

      // Same daemon (not respawned by the test process) or the case is void.
      expect(await readDaemonPid()).toBe(daemonPid);

      expect(environment.DAEMON_ONLY_SECRET).toBeUndefined();
      assertIsolatedEnvironment(environment);
      expect(environment.PWD).toBe(context.appDir);
    },
    30000,
  );
});
