import { describe, expect, test } from "bun:test";
import { isAgentHoldingPort, parsePm2Jlist } from "../../pm2/cli";

describe("parsePm2Jlist", () => {
  test("parses agent process entries from a jlist payload", () => {
    const output = JSON.stringify([
      { name: "xpm-agent", pm2_env: { namespace: "XPM", status: "online" } },
      { name: "other-app", pm2_env: { namespace: "default", status: "stopped" } },
    ]);

    expect(parsePm2Jlist(output)).toEqual([
      { name: "xpm-agent", pm2_env: { namespace: "XPM", status: "online" } },
      { name: "other-app", pm2_env: { namespace: "default", status: "stopped" } },
    ]);
  });

  test("returns undefined for malformed output", () => {
    expect(parsePm2Jlist("PM2 is not running")).toBeUndefined();
  });

  test("returns undefined when the payload is not an array", () => {
    expect(parsePm2Jlist('{"name":"xpm-agent"}')).toBeUndefined();
  });

  test("drops non-object entries", () => {
    expect(parsePm2Jlist(JSON.stringify([null, 42, { name: "xpm-agent" }]))).toEqual([{ name: "xpm-agent" }]);
  });
});

describe("isAgentHoldingPort", () => {
  const agent = { name: "xpm-agent", pm2_env: { namespace: "XPM", status: "online" } };

  test("returns true when the agent is online in its namespace", () => {
    expect(isAgentHoldingPort([agent])).toBe(true);
  });

  test("returns false when the agent is stopped or errored", () => {
    expect(isAgentHoldingPort([{ ...agent, pm2_env: { namespace: "XPM", status: "stopped" } }])).toBe(false);
    expect(isAgentHoldingPort([{ ...agent, pm2_env: { namespace: "XPM", status: "errored" } }])).toBe(false);
  });

  test("returns false for a different name or namespace", () => {
    expect(isAgentHoldingPort([{ ...agent, name: "other-app" }])).toBe(false);
    expect(isAgentHoldingPort([{ ...agent, pm2_env: { namespace: "default", status: "online" } }])).toBe(false);
  });

  test("returns false for an empty list", () => {
    expect(isAgentHoldingPort([])).toBe(false);
  });
});
