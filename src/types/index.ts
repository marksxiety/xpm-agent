
import type { ErrorCode } from "./error";

export interface ProcessSummary {
    pid: number;
    pm_id: number;
    name: string;
    namespace: string;
    status: string;
    uptime: number;
    restarts: number;
    unstable_restarts: number;
    exec_mode: string;
    instances: number | undefined;
    interpreter: string;
    cpu: number;
    memory: number;
    cwd: string | undefined;
    ip_address: string;
    watch: boolean;
    autorestart: boolean | undefined;
    logs?: ProcessLogs;
}

export type LogStreamType = "both" | "output" | "error";

export interface ProcessLogs {
    out?: string[];
    error?: string[];
}

export type ProcessMetrics = Record<string, unknown>;

export interface ProcessDescribeDetails {
    version: string | null;
    script_path: string | null;
    script_args: string | string[] | null;
    error_log_path: string | null;
    out_log_path: string | null;
    pid_path: string | null;
    interpreter_args: string[] | null;
    node_version: string | null;
    node_env: string | null;
    created_at: string | null;
    entire_log_path?: string;
    cron_restart?: string;
    max_memory_restart?: number | string;
}

export interface ProcessDescriptionDetails {
    summary: ProcessSummary;
    describe: ProcessDescribeDetails;
    metrics: ProcessMetrics;
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    code?: ErrorCode;
    info: T | null;
    status: number;
}

export interface SystemOverview {
    cpu: {
        usagePercent: number;
    },
    memory: {
        totalBytes: number;
        freeBytes: number;
        usedBytes: number;
        percentUsed: number;
    }
}

export interface SystemOverviewWithProcesses {
    overview: SystemOverview;
    processes: ProcessSummary[];
}