"use strict";

const { test, expect, mock } = require("bun:test");

const {
  buildSamples,
  render,
  renderLabelSet,
  escapeLabel,
  parseConfig,
  collect,
  createServer,
  statusCode,
  getSeverityRank,
  STATUS_CODES,
  findListeningPids,
  parseTasklistImageName,
  formatPortInUseError,
} = require("../exporter.js");

const severityCases = require("./severity-cases.json");

const EXPECTED_METRICS = [
  "pm2_cpu",
  "pm2_memory",
  "pm2_restarts_total",
  "pm2_start_time_seconds",
  "pm2_status",
  "pm2_unstable_restarts_total",
  "pm2_uptime",
];

function makeProc(overrides = {}) {
  const { pm2_env: envOverrides = {}, monit: monitOverrides = {}, ...rest } = overrides;
  return {
    pm_id: 0,
    name: "app",
    monit: { cpu: 1, memory: 1024, ...monitOverrides },
    pm2_env: {
      status: "online",
      namespace: "default",
      pm_uptime: 0,
      restart_time: 0,
      unstable_restarts: 0,
      autorestart: true,
      exit_code: 0,
      // Fields that must never surface as labels: prove they are ignored.
      version: "9.9.9",
      exec_interpreter: "/secret/node",
      node_version: "99.0.0",
      env: { SECRET_TOKEN: "do-not-leak" },
      cwd: "C:/secret",
      args: ["--secret"],
      ...envOverrides,
    },
    ...rest,
  };
}

test("buildSamples emits one series per process per metric with name/namespace/pm_id", () => {
  const samples = buildSamples([makeProc({ pm_id: 7, name: "api" })], 1_000_000);
  expect(samples).toHaveLength(EXPECTED_METRICS.length);
  for (const s of samples) {
    expect(s.labels).toEqual({ name: "api", namespace: "default", pm_id: "7" });
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
  const uptime = online.find((s) => s.name === "pm2_uptime").value;
  expect(Number.isFinite(uptime)).toBe(true);
  expect(uptime).toBe(103);

  const onlineMissing = buildSamples([makeProc({ pm2_env: { status: "online", pm_uptime: 0 } })], 1_003_000);
  expect(onlineMissing.find((s) => s.name === "pm2_uptime").value).toBe(0);

  const stopped = buildSamples([makeProc({ pm2_env: { status: "stopped", pm_uptime: 900_000 } })], 1_003_000);
  expect(stopped.find((s) => s.name === "pm2_uptime").value).toBe(0);
});

test("start_time_seconds handles missing pm_uptime and is emitted for every status", () => {
  const present = buildSamples([makeProc({ pm2_env: { pm_uptime: 1_700_000_000_000 } })]);
  expect(present.find((s) => s.name === "pm2_start_time_seconds").value).toBe(1_700_000_000);

  const missing = buildSamples([makeProc({ pm2_env: { pm_uptime: undefined } })]);
  expect(missing.find((s) => s.name === "pm2_start_time_seconds").value).toBe(0);

  const errored = buildSamples([makeProc({ pm2_env: { status: "errored", pm_uptime: 1_700_000_000_000 } })]);
  expect(errored.find((s) => s.name === "pm2_start_time_seconds").value).toBe(1_700_000_000);
});

test("no metric value is NaN across statuses, and counters are typed in the text output", () => {
  const list = [
    makeProc({ pm_id: 1, pm2_env: { status: "online", pm_uptime: 0 } }),
    makeProc({ pm_id: 2, pm2_env: { status: "errored", pm_uptime: undefined } }),
    makeProc({ pm_id: 3, pm2_env: { status: "stopped", autorestart: false, exit_code: 1 } }),
    makeProc({ pm_id: 4, pm2_env: { status: "waiting restart" } }),
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

test("two processes with the same name/namespace and different pm_id are distinct series", () => {
  const list = [
    makeProc({ pm_id: 3, name: "worker", pm2_env: { namespace: "XPM" } }),
    makeProc({ pm_id: 8, name: "worker", pm2_env: { namespace: "XPM" } }),
  ];
  const body = render(buildSamples(list));
  const cpu = body.split("\n").filter((l) => l.startsWith("pm2_cpu{"));
  expect(cpu).toHaveLength(2);
  expect(cpu.some((l) => l.includes('pm_id="3"'))).toBe(true);
  expect(cpu.some((l) => l.includes('pm_id="8"'))).toBe(true);
  expect(new Set(cpu).size).toBe(2);
});

test("namespace defaults to 'default' when absent", () => {
  const proc = makeProc({ pm2_env: { namespace: undefined } });
  const sample = buildSamples([proc]).find((s) => s.name === "pm2_status");
  expect(sample.labels.namespace).toBe("default");
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

test("findListeningPids flags TCP/TCPV6 listeners on any interface and ignores non-listeners", () => {
  const netstatOutput = [
    "  TCP    0.0.0.0:9209           0.0.0.0:0              LISTENING       1234",
    "  TCP    127.0.0.1:9209         0.0.0.0:0              LISTENING       1234",
    "  TCP    [::]:9209              [::]:0                 LISTENING       5678",
    "  TCP    192.168.1.5:9209       10.0.0.9:52344         ESTABLISHED     1234",
    "  TCP    10.0.0.9:9209          10.0.0.9:59877         TIME_WAIT       0",
    "  TCP    0.0.0.0:9210           0.0.0.0:0              LISTENING       9999",
    "  TCP    0.0.0.0:19209          0.0.0.0:0              LISTENING       8888",
    "",
  ].join("\r\n");
  expect(findListeningPids(netstatOutput, 9209).sort((a, b) => a - b)).toEqual([1234, 5678]);
});

test("findListeningPids ignores UDP rows and malformed lines", () => {
  const netstatOutput = [
    "  UDP    0.0.0.0:9209           *:*                                    1234",
    "  TCP    0.0.0.0:9209",
  ].join("\r\n");
  expect(findListeningPids(netstatOutput, 9209)).toEqual([]);
});

test("parseTasklistImageName extracts the image name and tolerates 'no tasks' output", () => {
  expect(parseTasklistImageName('"node.exe","1234","Console","1","20,000 K"\r\n')).toBe("node.exe");
  expect(parseTasklistImageName("INFO: No tasks are running which match the specified criteria.\r\n")).toBeUndefined();
});

test("formatPortInUseError names the owning process when known", () => {
  expect(formatPortInUseError(9209)).toContain("port 9209 is already in use");
  expect(formatPortInUseError(9209, 1234, "node.exe")).toContain("PID 1234 (node.exe)");
  expect(formatPortInUseError(9209, 1234)).toContain("PID 1234");
});

test("collect uses the injected pm2 adapter", async () => {
  const pm2 = { list: (cb) => cb(null, [makeProc({ name: "injected" })]) };
  const body = await collect({ pm2, now: 5_000 });
  expect(body).toContain('pm2_status{name="injected",namespace="default",pm_id="0"} 1');
});

test("mocks the pm2 module (callback -> promise)", async () => {
  mock.module("pm2", () => ({
    list: (cb) => cb(null, [makeProc({ pm_id: 42, name: "mocked" })]),
  }));
  const pm2 = require("pm2");
  const body = await collect({ pm2 });
  expect(body).toContain('name="mocked"');
  expect(body).toContain('pm_id="42"');
});

async function request(server, path) {
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}${path}`);
}

test("handler returns 200 with metrics when PM2 is reachable", async () => {
  const pm2 = { list: (cb) => cb(null, [makeProc({ pm2_env: { pm_uptime: Date.now() - 60_000 } })]) };
  const server = createServer({ pm2 });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await request(server, "/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("pm2_status");
    // Regression: the handler must pass a timestamp, not the Date.now function.
    expect(body).not.toContain("NaN");
  } finally {
    server.close();
  }
});

test("handler returns 503 and logs when PM2 is unreachable", async () => {
  const pm2 = { list: (cb) => cb(new Error("daemon down")) };
  const errors = [];
  const server = createServer({ pm2, log: { error: (m) => errors.push(m) } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await request(server, "/metrics");
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("PM2 unreachable");
    expect(errors).toHaveLength(1);
  } finally {
    server.close();
  }
});

test("handler 404s unknown paths", async () => {
  const server = createServer({ pm2: { list: (cb) => cb(null, []) } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await request(server, "/nope");
    expect(res.status).toBe(404);
  } finally {
    server.close();
  }
});

test("collect rejects when pm2.list never calls back (bounded by timeout)", async () => {
  const pm2 = { list: () => {} };
  await expect(collect({ pm2, timeoutMs: 30 })).rejects.toThrow(/did not respond within 30ms/);
});

test("handler returns 503 when pm2.list hangs", async () => {
  const errors = [];
  const server = createServer({ pm2: { list: () => {} }, timeoutMs: 30, log: { error: (m) => errors.push(m) } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await request(server, "/metrics");
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("PM2 unreachable");
    expect(errors[0]).toContain("did not respond");
  } finally {
    server.close();
  }
});
