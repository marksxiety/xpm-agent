import { expect } from "bun:test";
import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
  // prepareAppConf overwrites the caller's PWD with the app cwd
  // (node_modules/pm2/lib/Common.js:116) before the env is merged.
  "PWD",
]);

export function configureIsolatedPm2(label: string): CanaryContext {
  const runId = `${label}-${process.pid}-${Date.now()}`;
  const homeDir = path.join(os.tmpdir(), `xpm-canary-home-${runId}`);
  const appDir = path.join(os.tmpdir(), `xpm-canary-app-${runId}`);
  mkdirSync(homeDir, { recursive: true });

  process.env.PM2_HOME = homeDir;
  if (process.platform === "win32") {
    // Windows PM2 hardcodes \\.\pipe\rpc.sock (pm2/lib/paths.js), so a temp
    // PM2_HOME alone would collide with the live user daemon.
    process.env.PM2_DAEMON_RPC_PORT = `\\\\.\\pipe\\xpm-canary-rpc-${runId}`;
    process.env.PM2_DAEMON_PUB_PORT = `\\\\.\\pipe\\xpm-canary-pub-${runId}`;
  }
  delete process.env.AUTH_TOKEN;

  return { homeDir, appDir, dumpFile: path.join(appDir, "child-env.json"), runId };
}

export async function prepareAppDir(context: CanaryContext): Promise<void> {
  await fs.mkdir(context.appDir, { recursive: true });
  await fs.writeFile(path.join(context.appDir, "dump-env.js"), DUMP_SCRIPT, "utf8");
}

export function targetOs(): "win32" | "linux" {
  return process.platform === "win32" ? "win32" : "linux";
}

export async function startCanaryChild(context: CanaryContext): Promise<void> {
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

export async function cleanupCanary(context: CanaryContext): Promise<void> {
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
