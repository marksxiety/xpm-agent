import type { ProcessDescription, Proc } from "pm2";
import type { ProcessDescribeDetails, ProcessDescriptionDetails, ProcessSummary } from "../types";
import { getServerIpv4 } from "./network";

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
  exit_code?: number;
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
  max_restarts?: number;
  min_uptime?: number | string;
  restart_delay?: number | string;
  kill_timeout?: number | string;
  ignore_watch?: string[];
  watch_delay?: number | string;
  windowsHide?: boolean;
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
    cron_restart: processEnvironment?.cron_restart ?? null,
    exit_code: processEnvironment?.exit_code ?? null,
  };
}

function toIsoString(createdAt: number | undefined): string | null {
  if (typeof createdAt !== "number") return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Registration settings PM2 stores in `pm2_env` only when they were set.
 * Surfacing them lets the dashboard reconstruct how a process was registered;
 * an absent key means PM2 applied its built-in default.
 */
function describeRegistrationSettings(
  processEnvironment: ProcessEnvironment | undefined,
): Partial<ProcessDescribeDetails> {
  const settings: Partial<ProcessDescribeDetails> = {};

  if (processEnvironment?.max_restarts !== undefined) settings.max_restarts = processEnvironment.max_restarts;
  if (processEnvironment?.min_uptime !== undefined) settings.min_uptime = processEnvironment.min_uptime;
  if (processEnvironment?.restart_delay !== undefined) settings.restart_delay = processEnvironment.restart_delay;
  if (processEnvironment?.kill_timeout !== undefined) settings.kill_timeout = processEnvironment.kill_timeout;
  if (processEnvironment?.ignore_watch !== undefined) settings.ignore_watch = processEnvironment.ignore_watch;
  if (processEnvironment?.watch_delay !== undefined) settings.watch_delay = processEnvironment.watch_delay;
  if (processEnvironment?.windowsHide !== undefined) settings.windowsHide = processEnvironment.windowsHide;

  return settings;
}

export function describeProcessDetails(processDescription: ProcessDescription): ProcessDescriptionDetails {
  const processEnvironment = processDescription.pm2_env as ProcessEnvironment | undefined;

  return {
    summary: summarizeProcess(processDescription),
    describe: {
      // The agent is runtime-agnostic: it does not decide which fields are
      // "Node-only". PM2 only populates node_version/version/node_env for the
      // runs that have them, so any interpreter gets whatever is present.
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
      ...describeRegistrationSettings(processEnvironment),
    },
    metrics: processEnvironment?.axm_monitor ?? {},
  };
}

export function toProcessDescriptions(processes: Proc | Proc[] | undefined): ProcessDescription[] {
  return (Array.isArray(processes) ? processes : [processes]).filter(Boolean) as unknown as ProcessDescription[];
}
