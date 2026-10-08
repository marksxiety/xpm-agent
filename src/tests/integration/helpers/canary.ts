import { expect } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

export interface CanaryContext {
  homeDir: string;
  appDir: string;
  dumpFile: string;
  runId: string;
}

export const PAYLOAD_ENV = { FOO: "bar" };
export const APP_NAME = "canary-app";
export const APP_NAMESPACE = "canary";

const DUMP_SCRIPT = `const fs = require("fs");
const path = require("path");
fs.writeFileSync(path.join(__dirname, "child-env.json"), JSON.stringify(process.env, null, 2));
// Stay alive so PM2 keeps the process online across restart/reload/resurrect.
setInterval(() => {}, 1000);
`;

/**
 * PM2 keys read from `Windows` CreateProcess. Node/Bun re-add these to any
 * child on Windows even when the spawn env omits them.
 */
const WINDOWS_SYSTEM_KEYS = new Set([
  "PATH",
  "TEMP",
  "TMP",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOGONSERVER",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
]);

/**
 * Scalar `pm2_env` keys PM2 copies into the fork child env (God.executeApp
 * extends pm2_env with the app env, then ForkMode copies every scalar).
 */
const PM2_METADATA_KEYS = new Set([
  "name",
  "namespace",
  "cwd",
  "status",
  "pm_id",
  "pm_uptime",
  "pm_cwd",
  "pm_exec_path",
  "pm_pid_path",
  "pm_out_log_path",
  "pm_err_log_path",
  "pm_log_path",
  "restart_time",
  "unstable_restarts",
  "created_at",
  "exec_mode",
  "exec_interpreter",
  "instances",
  "instance_var",
  "autorestart",
  "watch",
  "windowsHide",
  "max_restarts",
  "min_uptime",
  "kill_timeout",
  "restart_delay",
  "merge_logs",
  "time",
  "log_date_format",
  "username",
  "unique_id",
  "NODE_APP_INSTANCE",
  "PM2_HOME",
  "vizion_running",
  "automation",
  "autostart",
  "treekill",
  "vizion",
  "pmx",
  "km_link",
  "exit_code",
  "kill_retry_time",
  "prev_restart_delay",
  // prepareAppConf overwrites the caller's PWD with the app cwd
  // (node_modules/pm2/lib/Common.js:116) before the env is merged.
  "PWD",
]);

/**
 * pm2/lib/paths.js applies `PM2_DAEMON_*_PORT` env overrides and then
 * unconditionally overwrites them with `\\.\pipe\rpc.sock`/`pub.sock` on
 * Windows. Patching the module in the require cache re-applies the overrides
 * after that block so the client talks to our isolated daemon, never the
 * machine-wide one.
 */
function patchPm2Paths(): void {
  const pathsPath = require.resolve("pm2/paths.js");
  const original = require(pathsPath) as (overHome?: string) => Record<string, string>;
  const cacheEntry = require.cache[pathsPath];
  if (!cacheEntry) throw new Error(`Cannot patch ${pathsPath}: not in require cache`);

  cacheEntry.exports = (overHome?: string) => {
    const structure = original(overHome);
    if (process.env.PM2_DAEMON_RPC_PORT) structure.DAEMON_RPC_PORT = process.env.PM2_DAEMON_RPC_PORT;
    if (process.env.PM2_DAEMON_PUB_PORT) structure.DAEMON_PUB_PORT = process.env.PM2_DAEMON_PUB_PORT;
    if (process.env.PM2_INTERACTOR_RPC_PORT) structure.INTERACTOR_RPC_PORT = process.env.PM2_INTERACTOR_RPC_PORT;
    return structure;
  };
}

function assertIsolatedPipes(): void {
  const constants = require("pm2/constants.js") as { DAEMON_RPC_PORT: string };
  const expected = process.platform === "win32" ? process.env.PM2_DAEMON_RPC_PORT : undefined;
  if (expected !== undefined && constants.DAEMON_RPC_PORT !== expected) {
    throw new Error(
      `Canary isolation failed: PM2 client would use ${constants.DAEMON_RPC_PORT}, not ${expected}`,
    );
  }
}

export function configureIsolatedPm2(label: string): CanaryContext {
  const runId = `${label}-${process.pid}-${Date.now()}`;
  const homeDir = path.join(os.tmpdir(), `xpm-canary-home-${runId}`);
  const appDir = path.join(os.tmpdir(), `xpm-canary-app-${runId}`);
  mkdirSync(homeDir, { recursive: true });

  process.env.PM2_HOME = homeDir;
  if (process.platform === "win32") {
    // Windows PM2 hardcodes the machine-wide pipes; these are re-applied by
    // patchPm2Paths() and passed to the isolated daemon explicitly.
    process.env.PM2_DAEMON_RPC_PORT = `\\\\.\\pipe\\xpm-canary-rpc-${runId}`;
    process.env.PM2_DAEMON_PUB_PORT = `\\\\.\\pipe\\xpm-canary-pub-${runId}`;
    process.env.PM2_INTERACTOR_RPC_PORT = `\\\\.\\pipe\\xpm-canary-interactor-${runId}`;
  }
  patchPm2Paths();
  assertIsolatedPipes();
  delete process.env.AUTH_TOKEN;

  return { homeDir, appDir, dumpFile: path.join(appDir, "child-env.json"), runId };
}

export function rpcSocketPath(context: CanaryContext): string {
  return process.platform === "win32"
    ? process.env.PM2_DAEMON_RPC_PORT ?? ""
    : path.join(context.homeDir, "rpc.sock");
}

/** Spawns the isolated daemon detached; returns its pid. */
export function launchIsolatedDaemon(context: CanaryContext, extraEnv: Record<string, string> = {}): number {
  const daemonPath = path.join(import.meta.dir, "isolated-daemon.ts");
  const child = spawn(process.execPath, [daemonPath], {
    env: { ...process.env, ...extraEnv },
    cwd: context.appDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  if (child.pid === undefined) throw new Error("Failed to spawn the isolated PM2 daemon");
  return child.pid;
}

function canConnect(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

/** Waits until the isolated daemon's RPC socket answers, so pm2.connect never spawns its own. */
export async function waitForDaemon(context: CanaryContext, timeoutMs = 20000): Promise<void> {
  const socketPath = rpcSocketPath(context);
  const pidFile = path.join(context.homeDir, "pm2.pid");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(pidFile) && (await canConnect(socketPath))) return;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for the isolated PM2 daemon (${socketPath})`);
}

export async function prepareAppDir(context: CanaryContext): Promise<void> {
  await fs.mkdir(context.appDir, { recursive: true });
  await fs.writeFile(path.join(context.appDir, "dump-env.js"), DUMP_SCRIPT, "utf8");
}

export function targetOs(): "win32" | "linux" {
  return process.platform === "win32" ? "win32" : "linux";
}

export async function startCanaryChild(context: CanaryContext): Promise<number> {
  await fs.rm(context.dumpFile, { force: true });
  const { createApp } = await import("../../../index");
  const response = await createApp().handle(
    new Request("http://localhost/pm2/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: APP_NAME,
        namespace: APP_NAMESPACE,
        targetOs: targetOs(),
        cwd: context.appDir,
        script: "dump-env.js",
        interpreter: process.execPath,
        env: PAYLOAD_ENV,
      }),
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { info?: Array<{ pm_id?: number }> };
  const pmId = body.info?.[0]?.pm_id;
  expect(typeof pmId).toBe("number");
  return pmId as number;
}

export async function postCanaryRoute(route: string): Promise<void> {
  const { createApp } = await import("../../../index");
  const response = await createApp().handle(new Request(`http://localhost${route}`, { method: "POST" }));
  expect(response.status).toBe(200);
}

export async function waitForEnvDump(context: CanaryContext, timeoutMs = 20000): Promise<Record<string, string>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await fs.readFile(context.dumpFile, "utf8")) as Record<string, string>;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error(`Timed out waiting for ${context.dumpFile}`);
}

/**
 * Kills only a daemon we launched: the temp-home pm2.pid must match the pid we
 * recorded, otherwise it disconnects and leaves the process alone.
 */
export async function cleanupCanary(context: CanaryContext, daemonPid?: number): Promise<void> {
  let recordedPid: number | undefined;
  try {
    recordedPid = Number((await fs.readFile(path.join(context.homeDir, "pm2.pid"), "utf8")).trim());
  } catch {
    recordedPid = undefined;
  }

  if (daemonPid !== undefined && recordedPid === daemonPid) {
    const pm2 = (await import("pm2")).default;
    await Promise.race([
      new Promise<void>((resolve) => {
        try {
          pm2.killDaemon(() => resolve());
        } catch {
          resolve();
        }
      }),
      Bun.sleep(5000),
    ]);
  }

  if (daemonPid !== undefined) {
    try {
      process.kill(daemonPid);
    } catch {
      // Already stopped by killDaemon.
    }
  }

  try {
    const pm2 = (await import("pm2")).default;
    pm2.disconnect();
  } catch {
    // Nothing to disconnect.
  }

  await fs.rm(context.homeDir, { recursive: true, force: true });
  await fs.rm(context.appDir, { recursive: true, force: true });
}

function readKey(environment: Record<string, string>, key: string): string | undefined {
  if (key in environment) return environment[key];
  if (process.platform !== "win32") return undefined;
  const match = Object.keys(environment).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return match ? environment[match] : undefined;
}

function isAllowedKey(key: string): boolean {
  if (key === APP_NAME) return true;
  if (PM2_METADATA_KEYS.has(key)) return true;
  if (/^(pm_|PM2_|axm_)/i.test(key)) return true;
  return WINDOWS_SYSTEM_KEYS.has(key.toUpperCase());
}

export function assertIsolatedEnvironment(environment: Record<string, string>): void {
  expect(environment.FOO).toBe("bar");
  expect(readKey(environment, "CANARY_SECRET")).toBeUndefined();

  const payloadKeys = new Set([...Object.keys(PAYLOAD_ENV), "namespace"]);
  const leaks = Object.keys(process.env)
    .filter((key) => !payloadKeys.has(key) && !isAllowedKey(key))
    .map((key) => ({ key, value: readKey(environment, key) }))
    .filter((entry) => entry.value !== undefined);
  expect(leaks).toEqual([]);

  const unexpected = Object.keys(environment).filter((key) => !isAllowedKey(key) && !(key in PAYLOAD_ENV));
  expect(unexpected).toEqual([]);
}
