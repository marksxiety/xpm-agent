import { test, expect } from "bun:test";
import {
  buildSamples,
  render,
  renderLabelSet,
  escapeLabel,
  statusCode,
  getSeverityRank,
  STATUS_CODES,
} from "../src/metrics";
import { makeProc } from "./support/make-proc";
import severityCases from "./severity-cases.json";

const EXPECTED_METRICS = [
  "pm2_cpu",
  "pm2_memory",
  "pm2_restarts_total",
  "pm2_start_time_seconds",
  "pm2_status",
  "pm2_unstable_restarts_total",
  "pm2_uptime",
];

test("buildSamples emits one series per process per metric with name/namespace", () => {
  const samples = buildSamples([makeProc({ pm_id: 7, name: "api" })], 1_000_000);
  expect(samples).toHaveLength(EXPECTED_METRICS.length);
  for (const s of samples) {
    expect(s.labels).toEqual({ name: "api", namespace: "default" });
  }
  expect(samples.map((s) => s.name).sort()).toEqual(EXPECTED_METRICS);
});

test("metric types: the two _total metrics are counters, the rest are gauges", () => {
  const byName = Object.fromEntries(buildSamples([makeProc()]).map((s) => [s.name, s.type]));
  expect(byName.pm2_restarts_total).toBe("counter");
  expect(byName.pm2_unstable_restarts_total).toBe("counter");
  for (const name of EXPECTED_METRICS) {
    if (!name.endsWith("_total")) expect(byName[name]).toBe("gauge");
  }
});

test("pm2_status maps every known status; unknown/other maps to 0", () => {
  expect(STATUS_CODES).toEqual({
    online: 1,
    launching: 2,
    stopping: 3,
    "waiting restart": 4,
    stopped: 5,
    errored: 6,
    "one-launch-status": 7,
  });
  expect(statusCode("online")).toBe(1);
  expect(statusCode("launching")).toBe(2);
  expect(statusCode("stopping")).toBe(3);
  expect(statusCode("waiting restart")).toBe(4);
  expect(statusCode("stopped")).toBe(5);
  expect(statusCode("errored")).toBe(6);
  expect(statusCode("one-launch-status")).toBe(7);
  expect(statusCode("frobnicating")).toBe(0);
  expect(statusCode(undefined)).toBe(0);
});

for (const c of severityCases) {
  test(`severity rank: ${c.name}`, () => {
    expect(getSeverityRank(c.input)).toBe(c.expected);
  });
}

test("uptime is finite for online with a valid pm_uptime and 0 otherwise", () => {
  const online = buildSamples([makeProc({ pm2_env: { status: "online", pm_uptime: 900_000 } })], 1_003_000);
  const uptime = online.find((s) => s.name === "pm2_uptime")?.value;
  expect(Number.isFinite(uptime)).toBe(true);
  expect(uptime).toBe(103);

  const onlineMissing = buildSamples([makeProc({ pm2_env: { status: "online", pm_uptime: 0 } })], 1_003_000);
  expect(onlineMissing.find((s) => s.name === "pm2_uptime")?.value).toBe(0);

  const stopped = buildSamples([makeProc({ pm2_env: { status: "stopped", pm_uptime: 900_000 } })], 1_003_000);
  expect(stopped.find((s) => s.name === "pm2_uptime")?.value).toBe(0);
});

test("start_time_seconds handles missing pm_uptime and is emitted for every status", () => {
  const present = buildSamples([makeProc({ pm2_env: { pm_uptime: 1_700_000_000_000 } })]);
  expect(present.find((s) => s.name === "pm2_start_time_seconds")?.value).toBe(1_700_000_000);

  const missing = buildSamples([makeProc({ pm2_env: { pm_uptime: undefined } })]);
  expect(missing.find((s) => s.name === "pm2_start_time_seconds")?.value).toBe(0);

  const errored = buildSamples([makeProc({ pm2_env: { status: "errored", pm_uptime: 1_700_000_000_000 } })]);
  expect(errored.find((s) => s.name === "pm2_start_time_seconds")?.value).toBe(1_700_000_000);
});

test("no metric value is NaN across statuses, and counters are typed in the text output", () => {
  const list = [
    makeProc({ pm_id: 1, pm2_env: { status: "online", pm_uptime: 0, unique_id: "u1" } }),
    makeProc({ pm_id: 2, pm2_env: { status: "errored", pm_uptime: undefined, unique_id: "u2" } }),
    makeProc({ pm_id: 3, pm2_env: { status: "stopped", autorestart: false, exit_code: 1, unique_id: "u3" } }),
    makeProc({ pm_id: 4, pm2_env: { status: "waiting restart", unique_id: "u4" } }),
  ];
  const body = render(buildSamples(list, 1_700_000_000_000));
  expect(body).not.toContain("NaN");
  expect(body).toContain("# TYPE pm2_restarts_total counter");
  expect(body).toContain("# TYPE pm2_unstable_restarts_total counter");
  expect(body).toContain("# TYPE pm2_cpu gauge");
  expect(body).toContain("# TYPE pm2_status gauge");
  expect(body).not.toContain("pm2_severity_rank");
  for (const s of buildSamples(list, 1_700_000_000_000)) expect(Number.isFinite(s.value)).toBe(true);
});

test("two live processes with the same name/namespace are disambiguated with unique_id", () => {
  const list = [
    makeProc({ pm_id: 3, name: "worker", pm2_env: { namespace: "XPM", unique_id: "uuid-a" } }),
    makeProc({ pm_id: 8, name: "worker", pm2_env: { namespace: "XPM", unique_id: "uuid-b" } }),
  ];
  const body = render(buildSamples(list));
  const cpu = body.split("\n").filter((l) => l.startsWith("pm2_cpu{"));
  expect(cpu).toHaveLength(2);
  expect(cpu.some((l) => l.includes('unique_id="uuid-a"'))).toBe(true);
  expect(cpu.some((l) => l.includes('unique_id="uuid-b"'))).toBe(true);
  expect(new Set(cpu).size).toBe(2);
});

test("colliding names fall back to pm_id when unique_id is missing", () => {
  const list = [
    makeProc({ pm_id: 3, name: "worker", pm2_env: { unique_id: undefined } }),
    makeProc({ pm_id: 8, name: "worker", pm2_env: { unique_id: undefined } }),
  ];
  const body = render(buildSamples(list));
  expect(body).toContain('pm2_status{name="worker",namespace="default",unique_id="3"} 1');
  expect(body).toContain('pm2_status{name="worker",namespace="default",unique_id="8"} 1');
});

test("the same name in different namespaces does not collide", () => {
  const list = [
    makeProc({ pm_id: 1, name: "worker", pm2_env: { namespace: "XPM" } }),
    makeProc({ pm_id: 2, name: "worker", pm2_env: { namespace: "other" } }),
  ];
  const body = render(buildSamples(list));
  const cpu = body.split("\n").filter((l) => l.startsWith("pm2_cpu{"));
  expect(cpu).toHaveLength(2);
  expect(cpu.some((l) => l.includes("unique_id"))).toBe(false);
});

test("delete + re-register keeps the same series for the same name/namespace", () => {
  const before = render(buildSamples([makeProc({ pm_id: 1, name: "test-process-1", pm2_env: { unique_id: "uuid-old" } })]));
  const after = render(buildSamples([makeProc({ pm_id: 7, name: "test-process-1", pm2_env: { unique_id: "uuid-new" } })]));
  const statusLine = (body: string) => body.split("\n").find((l) => l.startsWith("pm2_status{"));
  expect(statusLine(before)).toBe('pm2_status{name="test-process-1",namespace="default"} 1');
  expect(statusLine(after)).toBe(statusLine(before));
});

test("namespace defaults to 'default' when absent", () => {
  const proc = makeProc({ pm2_env: { namespace: undefined } });
  const sample = buildSamples([proc]).find((s) => s.name === "pm2_status");
  expect(sample?.labels.namespace).toBe("default");
});

test("render declares HELP/TYPE once and escapes label values", () => {
  const samples = buildSamples([
    makeProc({ name: 'we"ird\\name\nx' }),
    makeProc({ pm_id: 1, name: "other" }),
  ]);
  const body = render(samples);
  expect(body.split("# TYPE pm2_cpu gauge")).toHaveLength(2);
  expect(body).toContain('name="we\\"ird\\\\name\\nx"');
  expect(escapeLabel('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd');
});

test("render drops series no longer present between scrapes", () => {
  const first = render(buildSamples([makeProc({ name: "gone" })]));
  expect(first).toContain('name="gone"');
  const second = render(buildSamples([makeProc({ name: "kept" })]));
  expect(second).not.toContain('name="gone"');
  expect(second).toContain('name="kept"');
});

test("renderLabelSet is empty for no labels", () => {
  expect(renderLabelSet({})).toBe("");
});
