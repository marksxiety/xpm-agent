import type { ProcessDescription, Proc } from "pm2";
import type { ProcessDescriptionDetails, ProcessSummary } from "../types";
import { getServerIpv4 } from "./network"

interface ProcessEnvironment {
  status?: string;
  pm_uptime?: number;
  pm_id?: number;
  name?: string;
  namespace?: string;
  restart_time?: number;
  unstable_restarts?: number;
  exec_mode?: string;
  instances?: number;
  exec_interpreter?: string;
  pm_cwd?: string;
  pm_out_log_path?: string;
  pm_err_log_path?: string;
  watch?: boolean;
  autorestart?: boolean;
  version?: string;
  args?: string | string[];
  pm_exec_path?: string;
  pm_pid_path?: string;
  node_args?: string[];
  node_version?: string;
  created_at?: number;
  pm_log_path?: string;
  cron_restart?: string;
  max_memory_restart?: number | string;
  env?: { NODE_ENV?: string };
  axm_monitor?: Record<string, unknown>;
}

export function summarizeProcess(processDescription: ProcessDescription): ProcessSummary {
  const processEnvironment = processDescription.pm2_env as ProcessEnvironment | undefined;
  const status = processEnvironment?.status ?? "unknown";
  const pmUptime = processEnvironment?.pm_uptime;
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
    ip_address: getServerIpv4(),
    watch: Boolean(processEnvironment?.watch),
    autorestart: processEnvironment?.autorestart,
  };
}

function toIsoString(createdAt: number | undefined): string | null {
  if (typeof createdAt !== "number") return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function describeProcessDetails(processDescription: ProcessDescription): ProcessDescriptionDetails {
  const processEnvironment = processDescription.pm2_env as ProcessEnvironment | undefined;

  return {
    summary: summarizeProcess(processDescription),
    describe: {
      version: processEnvironment?.version ?? null,
      script_path: processEnvironment?.pm_exec_path ?? null,
      script_args: processEnvironment?.args ?? null,
      error_log_path: processEnvironment?.pm_err_log_path ?? null,
      out_log_path: processEnvironment?.pm_out_log_path ?? null,
      pid_path: processEnvironment?.pm_pid_path ?? null,
      interpreter_args: processEnvironment?.node_args?.length ? processEnvironment.node_args : null,
      node_version: processEnvironment?.node_version ?? null,
      node_env: processEnvironment?.env?.NODE_ENV ?? null,
      created_at: toIsoString(processEnvironment?.created_at),
      ...(processEnvironment?.pm_log_path !== undefined ? { entire_log_path: processEnvironment.pm_log_path } : {}),
      ...(processEnvironment?.cron_restart !== undefined ? { cron_restart: processEnvironment.cron_restart } : {}),
      ...(processEnvironment?.max_memory_restart ? { max_memory_restart: processEnvironment.max_memory_restart } : {}),
    },
    metrics: processEnvironment?.axm_monitor ?? {},
  };
}

export function toProcessDescriptions(processes: Proc | Proc[] | undefined): ProcessDescription[] {
  return (Array.isArray(processes) ? processes : [processes]).filter(Boolean) as unknown as ProcessDescription[];
}
