import { describe, expect, test } from "bun:test";
import { inspect } from "../../utils/inspect";
import type { Static } from "elysia";
import { StartPayload } from "../../schemas/process";

type Payload = Static<typeof StartPayload>;

function issues(payload: Payload): string[] {
  return inspect("start", payload).map((issue) => issue.field);
}

describe("pm2 start command", () => {
  test("returns no issues for a clean Node config", () => {
    const payload: Payload = {
      name: "client",
      script: ".output/server/index.mjs",
      interpreter: "node",
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
      interpreter: "node",
      exec_mode: "cluster",
      instances: 2,
    };
    expect(issues(payload)).toEqual([]);
  });

  test("returns no issues for a PHP artisan serve", () => {
    const payload: Payload = {
      name: "server",
      script: "artisan",
      interpreter: "php",
      args: "serve --host=127.0.0.1 --port=8000",
    };
    expect(issues(payload)).toEqual([]);
  });

  test("returns no issues for a PHP artisan worker with autorestart off", () => {
    const payload: Payload = {
      name: "worker",
      script: "artisan",
      interpreter: "php",
      args: "schedule:work",
      autorestart: false,
    };
    expect(issues(payload)).toEqual([]);
  });

  test("flags a Node script with a php interpreter", () => {
    const payload: Payload = {
      name: "client",
      script: "index.js",
      interpreter: "php",
    };
    expect(issues(payload)).toEqual(["interpreter"]);
  });

  test("flags a php script when interpreter is omitted (defaults to node)", () => {
    const payload: Payload = {
      name: "server",
      script: "server.php",
    };
    expect(issues(payload)).toEqual(["interpreter"]);
  });

  test("flags artisan with a node interpreter", () => {
    const payload: Payload = {
      name: "server",
      script: "artisan",
      interpreter: "node",
      args: "serve",
    };
    expect(issues(payload)).toEqual(["interpreter"]);
  });

  test("flags artisan without a subcommand", () => {
    const payload: Payload = {
      name: "server",
      script: "artisan",
      interpreter: "php",
    };
    expect(issues(payload)).toEqual(["args"]);
  });

  test("flags node_args on a php interpreter", () => {
    const payload: Payload = {
      name: "server",
      script: "artisan",
      interpreter: "php",
      args: "serve",
      node_args: "--env-file=.env",
    };
    expect(issues(payload)).toContain("node_args");
  });

  test("flags interpreter_args on a python interpreter", () => {
    const payload: Payload = {
      name: "app",
      script: "app.py",
      interpreter: "python",
      interpreter_args: ["--max-old-space-size=512"],
    };
    expect(issues(payload)).toContain("interpreter_args");
  });

  test("flags cluster mode on a php interpreter", () => {
    const payload: Payload = {
      name: "server",
      script: "artisan",
      interpreter: "php",
      args: "serve",
      exec_mode: "cluster",
      instances: 2,
    };
    expect(issues(payload)).toContain("exec_mode");
  });

  test("flags instances > 1 in fork mode", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 2,
    };
    expect(issues(payload)).toContain("instances");
  });

  test("flags instances 'max' without cluster mode", () => {
    const payload: Payload = {
      name: "api",
      script: "server.js",
      interpreter: "node",
      instances: "max",
    };
    expect(issues(payload)).toContain("instances");
  });
});