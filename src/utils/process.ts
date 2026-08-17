import type { ProcessDescription, Proc } from "pm2";
import type { ProcessSummary } from "../types";

export function summarizeProcess(process: ProcessDescription): ProcessSummary {
  const env = process.pm2_env as any;
  return {
    pid: process.pid ?? 0,
    pm_id: process.pm_id ?? env?.pm_id ?? -1,
    name: process.name ?? env?.name ?? "",
    namespace: env?.namespace ?? "default",
    status: env?.status ?? "unknown",
    uptime: env?.pm_uptime,
    restarts: env?.restart_time ?? 0,
    unstable_restarts: env?.unstable_restarts ?? 0,
    exec_mode: env?.exec_mode ?? "fork",
    instances: env?.instances,
    interpreter: env?.exec_interpreter ?? "none",
    cpu: process.monit?.cpu ?? 0,
    memory: process.monit?.memory ?? 0,
    cwd: env?.pm_cwd,
    watch: Boolean(env?.watch),
    autorestart: env?.autorestart,
  };
}

export function toProcessDescriptions(procs: Proc | Proc[] | undefined): ProcessDescription[] {
  return (Array.isArray(procs) ? procs : [procs]).filter(Boolean) as unknown as ProcessDescription[];
}
