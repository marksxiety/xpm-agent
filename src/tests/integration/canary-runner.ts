import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertIsolatedEnvironment,
  cleanupCanary,
  configureIsolatedPm2,
  launchIsolatedDaemon,
  postCanaryRoute,
  prepareAppDir,
  startCanaryChild,
  waitForDaemon,
  waitForEnvDump,
} from "./helpers/canary";

// The canary must run in its own process: pm2 is CommonJS and its require cache
// (PM2_HOME-derived constants) is shared process-wide, so running this inside
// `bun test` alongside mocked pm2 modules would poison the isolated paths.

const context = configureIsolatedPm2("canary");
process.env.CANARY_SECRET = `canary-secret-${context.runId}`;

// Present in the daemon's env, deliberately absent from the agent process.
const DAEMON_ONLY_SECRET = `daemon-only-${context.runId}`;

const LIVE_PID_FILE = path.join(os.homedir(), ".pm2", "pm2.pid");

const pm2 = (await import("pm2")).default;

interface ResurrectApi {
  resurrect(callback: (error: Error | null, result?: unknown) => void): void;
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return (await fs.readFile(filePath, "utf8")).trim();
  } catch {
    return undefined;
  }
}

async function readDaemonPid(timeoutMs = 15000): Promise<string> {
  const pidFile = path.join(context.homeDir, "pm2.pid");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pid = await readFileIfExists(pidFile);
    if (pid !== undefined) return pid;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${pidFile}`);
}

function promisify<T>(
  operation: (callback: (error: Error | null, result?: T) => void) => void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    operation((error, result) => (error ? reject(error) : resolve(result)));
  });
}

function assertCanaryEnv(environment: Record<string, string>): void {
  if (environment.DAEMON_ONLY_SECRET !== undefined) {
    throw new Error("daemon-only env leaked into the child");
  }
  assertIsolatedEnvironment(environment);
  // PWD is platform-dependent: it is stripped when the agent process already
  // had one (Linux CI) and survives with the app cwd when it did not (Windows).
  // The security requirement is only that it never points at the agent's dir.
  if (environment.PWD !== undefined && environment.PWD !== context.appDir) {
    throw new Error(`unexpected PWD=${environment.PWD}`);
  }
}

async function runIsolatedRoute(route: string): Promise<void> {
  await fs.rm(context.dumpFile, { force: true });
  await postCanaryRoute(route);
  assertCanaryEnv(await waitForEnvDump(context));
}

async function main(): Promise<void> {
  const liveDaemonPidBefore = await readFileIfExists(LIVE_PID_FILE);
  let daemonPid: number | undefined;

  try {
    await prepareAppDir(context);

    // Launch the daemon through a helper process so it inherits
    // DAEMON_ONLY_SECRET, a variable the agent process never sees.
    daemonPid = launchIsolatedDaemon(context, { DAEMON_ONLY_SECRET });
    await waitForDaemon(context);
    if ((await readDaemonPid()) !== String(daemonPid)) {
      throw new Error("isolated daemon pid does not match its pid file");
    }

    if (process.env.DAEMON_ONLY_SECRET !== undefined) {
      throw new Error("DAEMON_ONLY_SECRET must not be present in the agent env");
    }

    const pmId = await startCanaryChild(context);
    const environment = await waitForEnvDump(context);
    if ((await readDaemonPid()) !== String(daemonPid)) {
      throw new Error("daemon was respawned mid-test");
    }
    assertCanaryEnv(environment);
    if (environment.FOO !== "bar") {
      throw new Error(`expected FOO=bar, got ${environment.FOO}`);
    }

    await runIsolatedRoute(`/pm2/restart/${pmId}`);
    await runIsolatedRoute(`/pm2/reload/${pmId}`);

    // Resurrect: kill our daemon, re-launch an isolated one (never let
    // pm2.connect spawn a daemon on the machine-wide pipes), restore the dump.
    await promisify<void>((callback) => pm2.killDaemon(() => callback(null)));
    daemonPid = launchIsolatedDaemon(context, { DAEMON_ONLY_SECRET });
    await waitForDaemon(context);
    await fs.rm(context.dumpFile, { force: true });
    await promisify<void>((callback) => pm2.connect((error) => callback(error ?? null)));
    await promisify<unknown>((callback) =>
      (pm2 as unknown as ResurrectApi).resurrect((error, result) => callback(error, result)),
    );
    assertCanaryEnv(await waitForEnvDump(context));
  } finally {
    await cleanupCanary(context, daemonPid);
  }

  // The machine-wide daemon must be untouched by the whole run.
  if (liveDaemonPidBefore !== undefined) {
    const liveDaemonPidAfter = await readFileIfExists(LIVE_PID_FILE);
    if (liveDaemonPidAfter !== liveDaemonPidBefore) {
      throw new Error(
        `machine-wide PM2 daemon changed: ${liveDaemonPidBefore} -> ${liveDaemonPidAfter}`,
      );
    }
  }

  console.log("canary: start/restart/reload/resurrect env isolation verified");
  // pm2's RPC sockets keep the event loop alive even after disconnect().
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
