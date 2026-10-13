import { describe, expect, test } from "bun:test";
import { inspect } from "../../utils/inspect";
import type { Static } from "elysia";
import { StartPayload } from "../../schemas/process";

type Payload = Static<typeof StartPayload>;

const NODE = "C:\\Program Files\\nodejs\\node.exe";
const CWD = "C:\\apps\\example";
const LINUX_CWD = "/srv/apps/example";

function issues(payload: Payload): string[] {
  return inspect("start", payload).map((issue) => issue.field);
}

/** For values the schema rejects but the controller can still receive directly. */
function runtimeIssues(payload: Record<string, unknown>): string[] {
  return inspect("start", payload as unknown as Payload).map((issue) => issue.field);
}

describe("start inspection", () => {
  test("returns no issues for a clean Node config", () => {
    const payload: Payload = {
      name: "client",
      script: ".output/server/index.mjs",
      cwd: CWD,
      interpreter: NODE,
      interpreter_args: ["--env-file=.env"],
      exec_mode: "fork",
      instances: 1,
    };
    expect(
      inspect("start", payload, {
        interpreterFlags: { node: [{ kind: "path", flag: "--env-file" }] },
      }).map((issue) => issue.field),
    ).toEqual([]);
  });

  test("rejects interpreter_args when the server configures no flags for that interpreter", () => {
    const payload: Payload = {
      name: "client",
      script: ".output/server/index.mjs",
      cwd: CWD,
      interpreter: NODE,
      interpreter_args: ["--env-file=.env"],
    };
    expect(issues(payload)).toEqual(["interpreter_args"]);
  });

  test("accepts an allowlisted pattern flag when configured", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      interpreter_args: ["--max-old-space-size=512"],
    };
    expect(
      inspect("start", payload, {
        interpreterFlags: { node: [{ kind: "pattern", pattern: /^--max-old-space-size=\d+$/ }] },
      }).map((issue) => issue.field),
    ).toEqual([]);
  });

  test("returns no issues for commands not yet inspected (e.g. stop)", () => {
    expect(inspect("stop", {})).toEqual([]);
  });

  test("flags cluster mode even for a Node interpreter", () => {
    const payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      exec_mode: "cluster",
      instances: 2,
    };
    expect(runtimeIssues(payload)).toContain("exec_mode");
  });

  test("returns no issues for a bare binary with interpreter 'none'", () => {
    const payload: Payload = {
      name: "worker",
      script: "./my-binary",
      cwd: CWD,
      interpreter: "none",
    };
    expect(issues(payload)).toEqual([]);
  });

  test("flags a bare 'node' interpreter that is not an absolute path", () => {
    const payload: Payload = {
      name: "client",
      script: ".output/server/index.mjs",
      cwd: CWD,
      interpreter: "node",
    };
    expect(issues(payload)).toEqual(["interpreter"]);
  });

  test("flags interpreter_args on a non-node interpreter", () => {
    const payload: Payload = {
      name: "app",
      script: "app.py",
      cwd: CWD,
      interpreter: "none",
      interpreter_args: ["--max-old-space-size=512"],
    };
    expect(issues(payload)).toEqual(["interpreter_args"]);
  });

  test("flags cluster mode on a non-node interpreter", () => {
    const payload = {
      name: "server",
      script: "server.py",
      cwd: CWD,
      interpreter: "none",
      exec_mode: "cluster",
      instances: 2,
    };
    expect(runtimeIssues(payload)).toContain("exec_mode");
  });

  test("flags instances > 1", () => {
    const payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      exec_mode: "fork",
      instances: 2,
    };
    expect(runtimeIssues(payload)).toContain("instances");
  });

  test("flags instances 'max'", () => {
    const payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      instances: "max",
    };
    expect(runtimeIssues(payload)).toContain("instances");
  });

  test("flags an empty script", () => {
    const payload: Payload = {
      name: "api",
      script: "",
      cwd: CWD,
      interpreter: NODE,
    };
    expect(issues(payload)).toEqual(["script"]);
  });

  test("flags a whitespace-only script", () => {
    const payload: Payload = {
      name: "api",
      script: "   ",
      cwd: CWD,
      interpreter: NODE,
    };
    expect(issues(payload)).toEqual(["script"]);
  });

  test("flags instances that are not exactly 1", () => {
    const payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      instances: "2",
    };
    expect(runtimeIssues(payload)).toEqual(["instances"]);
  });

  test("flags instances of zero", () => {
    const payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      instances: 0,
    };
    expect(runtimeIssues(payload)).toEqual(["instances"]);
  });

  test("accepts duration strings and milliseconds for min_uptime", () => {
    expect(
      issues({ name: "api", script: "server.js", cwd: CWD, interpreter: NODE, min_uptime: "10s" }),
    ).toEqual([]);
    expect(
      issues({ name: "api", script: "server.js", cwd: CWD, interpreter: NODE, min_uptime: 10000 }),
    ).toEqual([]);
  });

  test("flags a malformed min_uptime", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      min_uptime: "soon",
    };
    expect(issues(payload)).toEqual(["min_uptime"]);
  });

  test("accepts duration strings and milliseconds for the other duration fields", () => {
    expect(
      issues({
        name: "api",
        script: "server.js",
        cwd: CWD,
        interpreter: NODE,
        restart_delay: "4s",
        kill_timeout: "5s",
        watch_delay: 1000,
      }),
    ).toEqual([]);
  });

  test("flags malformed restart_delay, kill_timeout and watch_delay", () => {
    const payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      restart_delay: "soon",
      kill_timeout: "later",
      watch_delay: "nope",
    };
    expect(runtimeIssues(payload)).toEqual(["restart_delay", "kill_timeout", "watch_delay"]);
  });

  test("flags negative instances", () => {
    const payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      instances: -1,
    };
    expect(runtimeIssues(payload)).toEqual(["instances"]);
  });

  test("returns no issues for a posix absolute interpreter on a win32 target", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: "/usr/bin/node",
      targetOs: "win32",
    };
    expect(issues(payload)).toEqual([]);
  });

  test("flags a windows absolute interpreter on a linux target", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: LINUX_CWD,
      interpreter: NODE,
      targetOs: "linux",
    };
    expect(issues(payload)).toEqual(["interpreter"]);
  });

  test("returns no issues for a posix absolute interpreter on a linux target", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: LINUX_CWD,
      interpreter: "/usr/bin/node",
      targetOs: "linux",
    };
    expect(issues(payload)).toEqual([]);
  });

  test("accepts any absolute interpreter path (agent is runtime-agnostic)", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: "C:\\Windows\\System32\\cmd.exe",
    };
    expect(issues(payload)).toEqual([]);
  });

  test("rejects an interpreter outside the configured interpreter roots", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
    };
    expect(
      inspect("start", payload, { interpreterRoots: ["C:\\other"] }).map((issue) => issue.field),
    ).toEqual(["interpreter"]);
  });

  test("rejects interpreter flags that can execute code", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      interpreter_args: ["--require=./evil.js"],
    };
    expect(
      inspect("start", payload, {
        interpreterFlags: {
          node: [
            { kind: "pattern", pattern: /^--max-old-space-size=\d+$/ },
            { kind: "path", flag: "--env-file" },
          ],
        },
      }).map((issue) => issue.field),
    ).toEqual(["interpreter_args"]);
  });

  test("rejects an env-file outside cwd", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      interpreter_args: ["--env-file=C:\\outside\\.env"],
    };
    expect(
      inspect("start", payload, {
        interpreterFlags: { node: [{ kind: "path", flag: "--env-file" }] },
      }).map((issue) => issue.field),
    ).toEqual(["interpreter_args"]);
  });

  test("rejects cwd with '..' segments", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: "C:\\apps\\..\\windows",
      interpreter: NODE,
    };
    expect(issues(payload)).toEqual(["cwd"]);
  });

  test("rejects the agent's own directory as cwd", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
    };
    expect(inspect("start", payload, { agentDir: CWD }).map((issue) => issue.field)).toEqual(["cwd"]);
  });

  test("rejects cwd outside configured app roots", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
    };
    expect(
      inspect("start", payload, { appRoots: ["C:\\other"] }).map((issue) => issue.field),
    ).toEqual(["cwd"]);
  });

  test("accepts an absolute script that resolves outside cwd", () => {
    const payload: Payload = {
      name: "php-web",
      script: "C:\\php\\php.exe",
      cwd: CWD,
      interpreter: "none",
    };
    expect(issues(payload)).toEqual([]);
  });

  test("accepts a relative script that escapes cwd", () => {
    const payload: Payload = {
      name: "api",
      script: "..\\evil.js",
      cwd: CWD,
      interpreter: NODE,
    };
    expect(issues(payload)).toEqual([]);
  });

  test("rejects a script with whitespace", () => {
    const payload: Payload = {
      name: "api",
      script: "my app.js",
      cwd: CWD,
      interpreter: NODE,
    };
    expect(issues(payload)).toEqual(["script"]);
  });

  test("rejects a namespace with path characters", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      namespace: "..\\evil",
    };
    expect(issues(payload)).toEqual(["namespace"]);
  });

  test("rejects agent process names in the agent namespace", () => {
    const payload: Payload = {
      name: "xpm-agent",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      namespace: "XPM",
    };
    expect(issues(payload)).toEqual(["name"]);
  });

  test("rejects an increment_var that is not a valid env key", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      increment_var: "1BAD",
      env: { "1BAD": "1" },
    };
    expect(issues(payload)).toEqual(["increment_var"]);
  });

  test("rejects a reserved increment_var", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      increment_var: "pm_id",
      env: { pm_id: "1" },
    };
    expect(issues(payload)).toEqual(["increment_var"]);
  });

  test("rejects an increment_var missing from env", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      increment_var: "PORT",
      env: { FOO: "bar" },
    };
    expect(issues(payload)).toEqual(["increment_var"]);
  });

  test("accepts an increment_var present in env", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      cwd: CWD,
      interpreter: NODE,
      increment_var: "PORT",
      env: { PORT: "3000" },
    };
    expect(issues(payload)).toEqual([]);
  });
});
