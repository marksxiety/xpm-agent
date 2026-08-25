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

  private handleError<T>(error: unknown): ApiResponse<T> {
    const { code, status, message } = classifyPm2Error(error);
    return respond(message, null, { success: false, status, code }) as ApiResponse<T>;
  }

  listProcesses = async (): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const processSummaries = await this.withPM2<ProcessSummary[]>((callback) =>
        pm2.list((listError, processDescriptions) =>
          callback(listError, processDescriptions?.map(summarizeProcess) ?? []),
        ),
      );
      return respond("PM2 process list retrieved successfully", processSummaries);
    } catch (error) {
      return this.handleError(error);
    }
  };

  describeProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.describe(processId, (describeError, descriptions) =>
          callback(describeError, descriptions ?? []),
        ),
      );
      if (processDescriptions.length === 0)
        return respond<ProcessSummary[]>(`Process ${processId} not found`, null, {
          success: false,
          status: 404,
          code: "PROCESS_NOT_FOUND",
        });
      return respond("PM2 process described successfully", processDescriptions.map(summarizeProcess));
    } catch (error) {
      return this.handleError(error);
    }
  };

  startProcess = async (payload: StartOptions): Promise<ApiResponse<ProcessSummary[] | StartIssue[]>> => {
    const issues = inspect("start", payload);
    if (issues.length > 0) {
      return respond("Invalid process configuration", issues, {
        success: false,
        status: 422,
        code: "INVALID_PROCESS_CONFIGURATION",
      });
    }

    try {
      const logOptions = resolveLogFiles({ name: payload.name || payload.script, namespace: payload.namespace });
      const launchedProcesses = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.start({ ...payload, ...logOptions }, (startError, processes) =>
          callback(startError, toProcessDescriptions(processes)),
        ),
      );
      const launchedProcessIds = launchedProcesses
        .map((process) => process.pm_id ?? (process.pm2_env as { pm_id?: number } | undefined)?.pm_id)
        .filter((processId): processId is number => typeof processId === "number" && processId >= 0);
      if (launchedProcessIds.length === 0)
        return respond("PM2 process started successfully", launchedProcesses.map(summarizeProcess));
      const listResponse = await this.listProcesses();
      if (!listResponse.success) return listResponse;
      const allProcesses = listResponse.info ?? [];
      return respond(
        "PM2 process started successfully",
        allProcesses.filter((process) => launchedProcessIds.includes(process.pm_id)),
      );
    } catch (error) {
      return this.handleError(error);
    }
  };

  stopProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.stop(processId, (stopError, processes) =>
          callback(stopError, toProcessDescriptions(processes)),
        ),
      );
      return respond("PM2 process stopped successfully", processDescriptions.map(summarizeProcess));
    } catch (error) {
      return this.handleError(error);
    }
  };

  restartProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.restart(processId, (restartError, processes) =>
          callback(restartError, toProcessDescriptions(processes)),
        ),
      );
      return respond("PM2 process restarted successfully", processDescriptions.map(summarizeProcess));
    } catch (error) {
      return this.handleError(error);
    }
  };

  reloadProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.reload(processId, (reloadError, processes) =>
          callback(reloadError, toProcessDescriptions(processes)),
        ),
      );
      return respond("PM2 process reloaded successfully", processDescriptions.map(summarizeProcess));
    } catch (error) {
      return this.handleError(error);
    }
  };

  deleteProcess = async (processId: number, deleteLogs = false): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      let logFilePaths: string[] = [];
      if (deleteLogs) {
        const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
          pm2.describe(processId, callback),
        );
        logFilePaths = processDescriptions.flatMap((process) => {
          const processEnvironment = process.pm2_env;
          return [processEnvironment?.pm_out_log_path, processEnvironment?.pm_err_log_path]
            .filter((filePath): filePath is string => typeof filePath === "string" && filePath.length > 0);
        });
      }
      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.delete(processId, (deleteError, processes) =>
          callback(deleteError, toProcessDescriptions(processes)),
        ),
      );
      if (logFilePaths.length > 0) {
        await Promise.all(
          logFilePaths.map((filePath) =>
            fs.unlink(filePath).catch((unlinkError) =>
              console.error(`Failed to delete log file ${filePath}:`, unlinkError),
            ),
          ),
        );
      }
      return respond("PM2 process deleted successfully", processDescriptions.map(summarizeProcess));
    } catch (error) {
      return this.handleError(error);
    }
  };

  flushLogs = async (processId?: number | string): Promise<ApiResponse<null>> => {
    try {
      const parsedProcessId = typeof processId === "string" ? Number(processId) : processId;
      if (parsedProcessId === undefined || Number.isNaN(parsedProcessId))
        return respond("Invalid process id", null, { success: false, status: 400, code: "INVALID_PROCESS_ID" });
      await this.withPM2<void>((callback) => pm2.flush(parsedProcessId, callback));
      return respond(`Logs for process ${parsedProcessId} flushed successfully`, null);
    } catch (error) {
      return this.handleError(error);
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