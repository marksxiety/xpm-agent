import type { ProcessDescription, Proc } from "pm2";
import type { ProcessSummary } from "../types";

export function summarizeProcess(process: ProcessDescription): ProcessSummary {
  const env = process.pm2_env as any;
  const status = env?.status ?? "unknown";
  const pmUptime = env?.pm_uptime as number | undefined;
  const uptime = status === "online" && typeof pmUptime === "number" ? Date.now() - pmUptime : 0;
  return {
    pid: process.pid ?? 0,
    pm_id: process.pm_id ?? env?.pm_id ?? -1,
    name: process.name ?? env?.name ?? "",
    namespace: env?.namespace ?? "default",
    status,
    uptime,
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
