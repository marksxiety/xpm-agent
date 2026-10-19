import { test, expect } from "bun:test";
import { parseConfig } from "../src/config";

test("parseConfig requires every EXPORTER_* variable", () => {
  expect(() => parseConfig({})).toThrow(/EXPORTER_PORT is not set/);
  expect(() => parseConfig({ EXPORTER_PORT: "   " })).toThrow(/EXPORTER_PORT is not set/);
  expect(() => parseConfig({ EXPORTER_PORT: "9209" })).toThrow(/EXPORTER_HOST is not set/);
  expect(() => parseConfig({ EXPORTER_PORT: "9209", EXPORTER_HOST: "" })).toThrow(/EXPORTER_HOST is not set/);
  expect(() => parseConfig({ EXPORTER_PORT: "9209", EXPORTER_HOST: "0.0.0.0" })).toThrow(/EXPORTER_TIMEOUT_MS is not set/);
});

test("parseConfig reads the required env values and rejects invalid ones", () => {
  expect(
    parseConfig({ EXPORTER_PORT: "9300", EXPORTER_HOST: "127.0.0.1", EXPORTER_TIMEOUT_MS: "2500" }),
  ).toEqual({ port: 9300, host: "127.0.0.1", timeoutMs: 2500 });

  const valid = { EXPORTER_HOST: "0.0.0.0", EXPORTER_TIMEOUT_MS: "5000" };
  expect(() => parseConfig({ ...valid, EXPORTER_PORT: "abc" })).toThrow(/Invalid EXPORTER_PORT/);
  expect(() => parseConfig({ ...valid, EXPORTER_PORT: "70000" })).toThrow(/Invalid EXPORTER_PORT/);
  expect(() => parseConfig({ EXPORTER_PORT: "9209", EXPORTER_HOST: "0.0.0.0", EXPORTER_TIMEOUT_MS: "0" })).toThrow(
    /Invalid EXPORTER_TIMEOUT_MS/,
  );
});
