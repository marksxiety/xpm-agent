
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
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    code?: ErrorCode;
    info: T | null;
    status: number;
}