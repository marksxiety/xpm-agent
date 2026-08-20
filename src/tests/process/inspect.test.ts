import { describe, expect, test } from "bun:test";
import { inspect } from "../../utils/inspect";
import type { Static } from "elysia";
import { StartPayload } from "../../schemas/process";

type Payload = Static<typeof StartPayload>;

const NODE = "C:\\Program Files\\nodejs\\node.exe";

function issues(payload: Payload): string[] {
  return inspect("start", payload).map((issue) => issue.field);
}

describe("start inspection", () => {
  test("returns no issues for a clean Node config", () => {
    const payload: Payload = {
      name: "client",
      script: ".output/server/index.mjs",
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

  test("returns no issues for a Node cluster with multiple instances", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      interpreter: NODE,
      exec_mode: "cluster",
      instances: 2,
    };
    expect(issues(payload)).toEqual([]);
  });

  test("returns no issues for a bare binary with interpreter 'none'", () => {
    const payload: Payload = {
      name: "worker",
      script: "./my-binary",
      interpreter: "none",
    };
    expect(issues(payload)).toEqual([]);
  });

  test("flags a bare 'node' interpreter that is not an absolute path", () => {
    const payload: Payload = {
      name: "client",
      script: ".output/server/index.mjs",
      interpreter: "node",
    };
    expect(issues(payload)).toEqual(["interpreter"]);
  });

  test("flags interpreter_args on a non-node interpreter", () => {
    const payload: Payload = {
      name: "app",
      script: "app.py",
      interpreter: "none",
      interpreter_args: ["--max-old-space-size=512"],
    };
    expect(issues(payload)).toEqual(["interpreter_args"]);
  });

  test("flags cluster mode on a non-node interpreter", () => {
    const payload: Payload = {
      name: "server",
      script: "server.py",
      interpreter: "none",
      exec_mode: "cluster",
      instances: 2,
    };
    expect(issues(payload)).toContain("exec_mode");
  });

  test("flags instances > 1 in fork mode", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      interpreter: NODE,
      exec_mode: "fork",
      instances: 2,
    };
    expect(issues(payload)).toContain("instances");
  });

  test("flags instances 'max' without cluster mode", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      interpreter: NODE,
      instances: "max",
    };
    expect(issues(payload)).toContain("instances");
  });
});