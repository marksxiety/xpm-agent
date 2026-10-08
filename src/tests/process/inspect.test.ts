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
    expect(issues(payload)).toEqual([]);
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
});
