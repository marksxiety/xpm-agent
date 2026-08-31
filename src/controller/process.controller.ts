import { promises as fs } from "node:fs";
import os from "node:os";
import pm2 from "pm2";
import type { ProcessDescription, StartOptions } from "pm2";
import type { ApiResponse, ProcessSummary, ProcessLogs, LogStreamType, SystemOverviewWithProcesses } from "../types";
import { respond } from "../utils/response";
import { classifyPm2Error } from "../utils/errors";
import { summarizeProcess, toProcessDescriptions } from "../utils/process";
import { resolveLogFiles, tailLines } from "../utils/log";
import { inspect } from "../utils/inspect";
import { StartIssue } from "../types/inspect";
import { getHostMetrics, type OsModule } from "../utils/system";
export class ProcessController {
  constructor(private osModule: OsModule = os) {}
  
  private withPM2<T>(
    operation: (callback: (operationError: Error | null, result?: T) => void) => void,
    autoSave = false,
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

          const finish = (finalError: Error | null) => {
            pm2.disconnect();
            if (finalError) reject(finalError);
            else resolve(result as T);
          };

          // If the main command succeeded and autoSave is requested, dump before disconnecting
          // autosave is saving the current snapshot of the services that was running
          // from memory to persisted (even if the server restarts, it will be saved)
          if (!operationError && autoSave) {
            pm2.dump((dumpError) => {
              if (dumpError) {
                console.error("Failed to auto-save PM2 process list:", dumpError);
              }
              finish(operationError);
            });
          } else {
            finish(operationError);
          }
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

  private async readLogFile(filePath: string | undefined, tail?: number): Promise<string[]> {
    if (!filePath || filePath.length === 0) return [];
    try {
      return tailLines(await fs.readFile(filePath, "utf8"), tail);
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw readError;
    }
  }

  listProcesses(tail?: number): Promise<ApiResponse<ProcessSummary[]>>;
  listProcesses(tail: number | undefined, includeOverview: true): Promise<ApiResponse<SystemOverviewWithProcesses>>;
  listProcesses(tail?: number, includeOverview?: boolean): Promise<ApiResponse<ProcessSummary[] | SystemOverviewWithProcesses>>;
  async listProcesses(tail?: number, includeOverview = false): Promise<ApiResponse<ProcessSummary[] | SystemOverviewWithProcesses>> {
    try {
      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.list((listError, list) => callback(listError, list ?? [])),
      );
      const processSummaries = processDescriptions.map(summarizeProcess);
      let info: ProcessSummary[] | SystemOverviewWithProcesses = processSummaries;
      if (tail !== undefined) {
        const summariesWithLogs = await Promise.all(
          processSummaries.map(async (summary, index) => {
            const processEnvironment = processDescriptions[index].pm2_env;
            const [out, error] = await Promise.all([
              this.readLogFile(processEnvironment?.pm_out_log_path, tail),
              this.readLogFile(processEnvironment?.pm_err_log_path, tail),
            ]);
            return { ...summary, logs: { out, error } };
          }),
        );
        info = summariesWithLogs;
      }
      if (includeOverview) {
        info = { overview: getHostMetrics(this.osModule), processes: info as ProcessSummary[] };
      }
      return respond("PM2 process list retrieved successfully", info);
    } catch (error) {
      return this.handleError(error);
    }
  }

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
        pm2.start({ ...payload, ...logOptions, time: true }, (startError, processes) =>
          callback(startError, toProcessDescriptions(processes)),
        ),
        true // auto-save when starting a process
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
        true // auto-save when deleting a process
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

  flushLogs = async (processId: number): Promise<ApiResponse<null>> => {
    try {
      const parsedProcessId = Number(processId);
      if (Number.isNaN(parsedProcessId))
        return respond("Invalid process id", null, { success: false, status: 400, code: "INVALID_PROCESS_ID" });
      await this.withPM2<void>((callback) => pm2.flush(parsedProcessId, callback));
      return respond(`Logs for process ${parsedProcessId} flushed successfully`, null);
    } catch (error) {
      return this.handleError(error);
    }
  };

  getLogs = async (
    processId: number,
    tail?: number,
    type: LogStreamType = "both",
  ): Promise<ApiResponse<ProcessLogs>> => {
    try {
      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.describe(processId, (describeError, descriptions) =>
          callback(describeError, descriptions ?? []),
        ),
      );
      if (processDescriptions.length === 0)
        return respond<ProcessLogs>(`Process ${processId} not found`, null, {
          success: false,
          status: 404,
          code: "PROCESS_NOT_FOUND",
        });
      const processEnvironment = processDescriptions[0].pm2_env;
      const info: ProcessLogs = {};
      if (type === "both" || type === "output") info.out = await this.readLogFile(processEnvironment?.pm_out_log_path, tail);
      if (type === "both" || type === "error") info.error = await this.readLogFile(processEnvironment?.pm_err_log_path, tail);
      return respond("PM2 process logs retrieved successfully", info);
    } catch (error) {
      return this.handleError(error);
    }
  };
}

export const processController = new ProcessController();