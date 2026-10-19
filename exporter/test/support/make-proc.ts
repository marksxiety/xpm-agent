import type { Pm2ProcessInput, ProcessMonit } from "../../src/metrics";

type ProcOverrides = {
  pm_id?: unknown;
  name?: unknown;
  monit?: ProcessMonit;
  pm2_env?: Record<string, unknown>;
};

export function makeProc(overrides: ProcOverrides = {}): Pm2ProcessInput {
  const { pm2_env: envOverrides = {}, monit: monitOverrides = {}, ...rest } =
    overrides;

  const environment: Record<string, unknown> = {
    status: "online",
    namespace: "default",
    pm_uptime: 0,
    restart_time: 0,
    unstable_restarts: 0,
    unique_id: "00000000-0000-4000-8000-000000000000",
    // Fields that must never surface as labels: prove they are ignored.
    version: "9.9.9",
    exec_interpreter: "/secret/node",
    node_version: "99.0.0",
    env: { SECRET_TOKEN: "do-not-leak" },
    cwd: "C:/secret",
    args: ["--secret"],
    ...envOverrides,
  };

  return {
    pm_id: 0,
    name: "app",
    monit: { cpu: 1, memory: 1024, ...monitOverrides },
    pm2_env: environment,
    ...rest,
  };
}
