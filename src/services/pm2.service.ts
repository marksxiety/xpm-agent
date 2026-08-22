import { promises as fs } from "node:fs";
import pm2 from "pm2";
import type { ProcessDescription, StartOptions } from "pm2";
import type { ApiResponse, ProcessSummary } from "../types";
import { respond } from "../utils/response";
import { classifyPm2Error } from "../utils/errors";
import { summarizeProcess, toProcessDescriptions } from "../utils/process";
import { resolveLogFiles } from "../utils/log";
import { getCurrentTimeStamp } from "../utils/datetime";
import { inspect } from "../utils/inspect";
import { StartIssue } from "../types/inspect";
class PM2Service {
  private withPM2<T>(
    operation: (callback: (operationError: Error | null, result?: T) => void) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      pm2.connect((connectionError) => {
        if (connectionError) {
          reject(connectionError);
          return;
        }

        let alreadySettled = false;

        const settle = (operationError: Error | null, result?: T) => {
          if (alreadySettled) return;
          alreadySettled = true;
          pm2.disconnect();
          if (operationError) reject(operationError);
          else resolve(result as T);
        };

        try {
          operation(settle);
        } catch (thrownError) {
          settle(thrownError instanceof Error ? thrownError : new Error(String(thrownError)));
        }
      });
    });
  }

  private handleError<T>(err: unknown): ApiResponse<T> {
    const { status, message } = classifyPm2Error(err);
    return respond(message, null, { success: false, status }) as ApiResponse<T>;
  }

  listProcesses = async (): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const list = await this.withPM2<ProcessSummary[]>((cb) =>
        pm2.list((err, l) => cb(err, l?.map(summarizeProcess) ?? [])),
      );
      return respond("PM2 process list retrieved successfully", list);
    } catch (err) {
      return this.handleError(err);
    }
  };

  describeProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const list = await this.withPM2<ProcessDescription[]>((cb) =>
        pm2.describe(processId, (err, l) => cb(err, l ?? [])),
      );
      if (list.length === 0)
        return respond<ProcessSummary[]>(`Process ${processId} not found`, null, { success: false, status: 404 });
      return respond("PM2 process described successfully", list.map(summarizeProcess));
    } catch (err) {
      return this.handleError(err);
    }
  };

  startProcess = async (body: StartOptions): Promise<ApiResponse<ProcessSummary[] | StartIssue[]>> => {
    const issues = inspect("start", body);
    if (issues.length > 0) {
      return respond("Invalid process configuration", issues, { success: false, status: 422 });
    }

    try {
      const logOptions = resolveLogFiles({ name: body.name || body.script, namespace: body.namespace });
      const launched = await this.withPM2<ProcessDescription[]>((cb) =>
        pm2.start({ ...body, ...logOptions }, (err, procs) => cb(err, toProcessDescriptions(procs))),
      );
      const ids = launched
        .map((p) => p.pm_id ?? (p.pm2_env as { pm_id?: number } | undefined)?.pm_id)
        .filter((id): id is number => typeof id === "number" && id >= 0);
      if (ids.length === 0) return respond("PM2 process started successfully", launched.map(summarizeProcess));
      const listResponse = await this.listProcesses();
      if (!listResponse.success) return listResponse;
      const list = listResponse.info ?? [];
      return respond("PM2 process started successfully", list.filter((p) => ids.includes(p.pm_id)));
    } catch (err) {
      return this.handleError(err);
    }
  };

  stopProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const procs = await this.withPM2<ProcessDescription[]>((cb) =>
        pm2.stop(processId, (err, p) => cb(err, toProcessDescriptions(p))),
      );
      return respond("PM2 process stopped successfully", procs.map(summarizeProcess));
    } catch (err) {
      return this.handleError(err);
    }
  };

  restartProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const procs = await this.withPM2<ProcessDescription[]>((cb) =>
        pm2.restart(processId, (err, p) => cb(err, toProcessDescriptions(p))),
      );
      return respond("PM2 process restarted successfully", procs.map(summarizeProcess));
    } catch (err) {
      return this.handleError(err);
    }
  };

  reloadProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const procs = await this.withPM2<ProcessDescription[]>((cb) =>
        pm2.reload(processId, (err, p) => cb(err, toProcessDescriptions(p))),
      );
      return respond("PM2 process reloaded successfully", procs.map(summarizeProcess));
    } catch (err) {
      return this.handleError(err);
    }
  };

  deleteProcess = async (processId: number, deleteLogs = false): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      let logFiles: string[] = [];
      if (deleteLogs) {
        const desc = await this.withPM2<ProcessDescription[]>((cb) => pm2.describe(processId, cb));
        logFiles = desc.flatMap((p) => {
          const env = p.pm2_env as any;
          return [env?.pm_out_log_path, env?.pm_err_log_path].filter((f): f is string => typeof f === "string" && f.length > 0);
        });
      }
      const procs = await this.withPM2<ProcessDescription[]>((cb) =>
        pm2.delete(processId, (err, p) => cb(err, toProcessDescriptions(p))),
      );
      if (logFiles.length > 0) {
        await Promise.all(
          logFiles.map((file) =>
            fs.unlink(file).catch((e) => console.error(`Failed to delete log file ${file}:`, e)),
          ),
        );
      }
      return respond("PM2 process deleted successfully", procs.map(summarizeProcess));
    } catch (err) {
      return this.handleError(err);
    }
  };

  flushLogs = async (processId?: number | string): Promise<ApiResponse<null>> => {
    try {
      const id = typeof processId === "string" ? Number(processId) : processId;
      if (id === undefined || Number.isNaN(id))
        return respond("Invalid process id", null, { success: false, status: 400 });
      await this.withPM2<void>((cb) => pm2.flush(id, cb));
      return respond("PM2 logs flushed successfully", null);
    } catch (err) {
      return this.handleError(err);
    }
  };

  healthCheck = (): ApiResponse<{ status: string; uptime: number; timestamp: number }> =>
    respond("PM2 health check passed", {
      status: "ok",
      uptime: process.uptime(),
      timestamp: getCurrentTimeStamp(),
    });
}

export const pm2Service = new PM2Service();