import type { ProcessDescription, Proc } from "pm2";
import type { ProcessSummary } from "../types";

export function summarizeProcess(processDescription: ProcessDescription): ProcessSummary {
  const processEnvironment = processDescription.pm2_env as any;
  const status = processEnvironment?.status ?? "unknown";
  const pmUptime = processEnvironment?.pm_uptime as number | undefined;
  const uptime = status === "online" && typeof pmUptime === "number" ? Date.now() - pmUptime : 0;
  return {
    pid: processDescription.pid ?? 0,
    pm_id: processDescription.pm_id ?? processEnvironment?.pm_id ?? -1,
    name: processDescription.name ?? processEnvironment?.name ?? "",
    namespace: processEnvironment?.namespace ?? "default",
    status,
    uptime,
    restarts: processEnvironment?.restart_time ?? 0,
    unstable_restarts: processEnvironment?.unstable_restarts ?? 0,
    exec_mode: processEnvironment?.exec_mode ?? "fork",
    instances: processEnvironment?.instances,
    interpreter: processEnvironment?.exec_interpreter ?? "none",
    cpu: processDescription.monit?.cpu ?? 0,
    memory: processDescription.monit?.memory ?? 0,
    cwd: processEnvironment?.pm_cwd,
    watch: Boolean(processEnvironment?.watch),
    autorestart: processEnvironment?.autorestart,
  };
}

export function toProcessDescriptions(processes: Proc | Proc[] | undefined): ProcessDescription[] {
  return (Array.isArray(processes) ? processes : [processes]).filter(Boolean) as unknown as ProcessDescription[];
}
