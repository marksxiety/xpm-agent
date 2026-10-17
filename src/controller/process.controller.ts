import { promises as fs } from "node:fs";
import pm2 from "pm2";
import type { ProcessDescription, StartOptions } from "pm2";
import type { ApiResponse, ProcessDescriptionDetails, ProcessNameConflict, ProcessSummary, ProcessLogs, ProcessLogsClearResult, ProcessLogSize, LogClearScope, LogStreamSelection, LogStreamType, SystemOverviewWithProcesses } from "../types";
import { respond } from "../utils/response";
import { classifyPm2Error } from "../utils/errors";
import { describeProcessDetails, summarizeProcess, toProcessDescriptions } from "../utils/process";
import { resolveLogFiles, resolveRotatedLogFiles, tailLines, logStreamBytes, logMetricsSource, truncateLogFile, deleteRotatedLogFiles, type LogMetricsSource } from "../utils/log";
import { sanitizeProcessConfigAsync, type SanitizeInput } from "../utils/sanitize";
import { StartIssue } from "../types/inspect";
import { getHostMetrics, systemInformationSource, type HostMetricsSource } from "../utils/system";
import { pm2Connection, type Pm2Connection } from "../pm2/client";
import { AGENT_NAME, AGENT_NAMESPACE } from "../pm2/cli";
import { config } from "../config";

const LOG_STREAM_SELECTIONS: readonly LogStreamSelection[] = ["all", "out", "err"];
const LOG_CLEAR_SCOPES: readonly LogClearScope[] = ["active", "rotated", "all"];

export class ProcessController {
  private startChain: Promise<void> = Promise.resolve();

  constructor(
    private metricsSource: HostMetricsSource = systemInformationSource,
    private connection: Pm2Connection = pm2Connection,
    private logSource: LogMetricsSource = logMetricsSource,
  ) { }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.startChain.then(operation);
    this.startChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async withPM2<T>(
    operation: (callback: (operationError: Error | null, result?: T) => void) => void,
    autoSave = false,
  ): Promise<T> {
    const result = await this.connection.execute(operation);

    if (autoSave) {
      try {
        await this.connection.execute<void>((callback) => pm2.dump((dumpError) => callback(dumpError)));
      } catch (dumpError) {
        console.error("Failed to auto-save PM2 process list:", dumpError);
      }
    }

    return result;
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
            const [out, error, outBytes, errorBytes] = await Promise.all([
              this.readLogFile(processEnvironment?.pm_out_log_path, tail),
              this.readLogFile(processEnvironment?.pm_err_log_path, tail),
              logStreamBytes(processEnvironment?.pm_out_log_path),
              logStreamBytes(processEnvironment?.pm_err_log_path),
            ]);
            return { ...summary, logs: { out, error, size: { out: outBytes, error: errorBytes } } };
          }),
        );
        info = summariesWithLogs;
      }
      if (includeOverview) {
        info = {
          overview: await getHostMetrics(this.metricsSource, this.logSource),
          processes: info as ProcessSummary[],
        };
      }
      return respond("PM2 process list retrieved successfully", info);
    } catch (error) {
      return this.handleError(error);
    }
  }

  describeProcess = async (processId: number): Promise<ApiResponse<ProcessDescriptionDetails>> => {
    try {
      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.describe(processId, (describeError, descriptions) =>
          callback(describeError, descriptions ?? []),
        ),
      );
      if (processDescriptions.length === 0)
        return respond<ProcessDescriptionDetails>(`Process ${processId} not found`, null, {
          success: false,
          status: 404,
          code: "PROCESS_NOT_FOUND",
        });
      return respond("PM2 process described successfully", describeProcessDetails(processDescriptions[0]));
    } catch (error) {
      return this.handleError(error);
    }
  };

  private async findProcessByName(name: string): Promise<ProcessNameConflict | null> {
    const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
      pm2.list((listError, list) => callback(listError, list ?? [])),
    );

    // PM2's default is case-insensitive for process names, so we normalize the name to lowercase for comparison.
    // Note that this may not be the same behavior as PM2's internal name matching, but it is a safety precaution because PM2 accepts name
    // as the identifer for operations like stop/restart/delete, and we want to avoid accidentally stopping/restarting/deleting the wrong process.
    const normalized = name.trim().toLowerCase();
    const existingProcess = processDescriptions.find(
      (process) => process.name?.toLowerCase() === normalized
    );

    if (!existingProcess) return null;
    const summary = summarizeProcess(existingProcess);
    return { pm_id: summary.pm_id, name: summary.name, namespace: summary.namespace };
  }

  private isAgentProcess(target: ProcessDescription | undefined): boolean {
    const targetNamespace = (target?.pm2_env as { namespace?: string } | undefined)?.namespace;
    return Boolean(target?.name && AGENT_NAME.has(target.name) && targetNamespace === AGENT_NAMESPACE);
  }

  /**
   * Fails closed: if the target cannot be inspected, the error propagates and
   * the caller answers 503/500 instead of proceeding with the operation.
   */
  private async rejectAgentTarget<T>(processId: number): Promise<ApiResponse<T> | null> {
    const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
      pm2.describe(processId, (describeError, descriptions) => callback(describeError, descriptions ?? [])),
    );
    if (this.isAgentProcess(processDescriptions[0])) {
      return respond("Refusing to manage the xpm-agent process itself", null, {
        success: false,
        status: 409,
        code: "AGENT_SELF_MANAGEMENT_FORBIDDEN",
      }) as ApiResponse<T>;
    }
    return null;
  }

  startProcess = async (payload: StartOptions): Promise<ApiResponse<ProcessSummary[] | StartIssue[] | ProcessNameConflict>> => {
    const { options, issues } = await sanitizeProcessConfigAsync(payload as unknown as SanitizeInput, {
      appRoots: config.APP_ROOTS,
      agentDir: process.cwd(),
      interpreterRoots: config.INTERPRETER_ROOTS,
      interpreterFlags: config.INTERPRETER_FLAGS,
    });
    if (options === null) {
      return respond("Invalid process configuration", issues, {
        success: false,
        status: 422,
        code: "INVALID_PROCESS_CONFIGURATION",
      });
    }

    return this.runExclusive(async () => {
      try {
        const conflict = await this.findProcessByName(options.name ?? "");
        if (conflict) {
          return respond(
            `Process name '${conflict.name}' already exists in namespace '${conflict.namespace}' (pm_id ${conflict.pm_id})`,
            conflict,
            { success: false, status: 409, code: "PROCESS_NAME_CONFLICT" },
          );
        }

        const namespace = options.namespace ?? "default";
        const logOptions = resolveLogFiles({ name: options.name || options.script || "", namespace });

        const launchedProcesses = await this.withPM2<ProcessDescription[]>((callback) =>
          pm2.start(
            { ...options, ...logOptions },
            (startError, processes) => callback(startError, toProcessDescriptions(processes)),
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
    });
  };

  stopProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const blocked = await this.rejectAgentTarget<ProcessSummary[]>(processId);
      if (blocked) return blocked;

      const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.stop(processId, (stopError, processes) =>
          callback(stopError, toProcessDescriptions(processes)),
        ),
        true // auto-save so a reboot restores the stopped state
      );
      return respond("PM2 process stopped successfully", processDescriptions.map(summarizeProcess));
    } catch (error) {
      return this.handleError(error);
    }
  };

  restartProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const blocked = await this.rejectAgentTarget<ProcessSummary[]>(processId);
      if (blocked) return blocked;

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
      const blocked = await this.rejectAgentTarget<ProcessSummary[]>(processId);
      if (blocked) return blocked;

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
      const blocked = await this.rejectAgentTarget<ProcessSummary[]>(processId);
      if (blocked) return blocked;

      let logFilePaths: string[] = [];
      if (deleteLogs) {
        const processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
          pm2.describe(processId, callback),
        );
        const baseLogPaths = processDescriptions.flatMap((process) => {
          const processEnvironment = process.pm2_env;
          return [processEnvironment?.pm_out_log_path, processEnvironment?.pm_err_log_path]
            .filter((filePath): filePath is string => typeof filePath === "string" && filePath.length > 0);
        });
        // Include rotated siblings (`<stem>__*`) so log-rotated files are not orphaned.
        logFilePaths = (
          await Promise.all(
            baseLogPaths.map(async (baseLogPath) => [
              baseLogPath,
              ...(await resolveRotatedLogFiles(baseLogPath)),
            ]),
          )
        ).flat();
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

  /**
   * Truncates active log files in place and/or deletes rotated archives for a
   * process. Active files are truncated (never unlinked) so the running process
   * keeps writing through its open descriptor.
   */
  clearLogs = async (
    processId: number,
    stream?: string,
    scope?: string,
  ): Promise<ApiResponse<ProcessLogsClearResult>> => {
    const selectedStream = stream ?? "all";
    const selectedScope = scope ?? "active";
    if (!LOG_STREAM_SELECTIONS.includes(selectedStream as LogStreamSelection))
      return respond<ProcessLogsClearResult>(
        `Invalid stream '${selectedStream}' — expected one of: ${LOG_STREAM_SELECTIONS.join(", ")}`,
        null,
        { success: false, status: 400, code: "INVALID_LOG_QUERY" },
      );
    if (!LOG_CLEAR_SCOPES.includes(selectedScope as LogClearScope))
      return respond<ProcessLogsClearResult>(
        `Invalid scope '${selectedScope}' — expected one of: ${LOG_CLEAR_SCOPES.join(", ")}`,
        null,
        { success: false, status: 400, code: "INVALID_LOG_QUERY" },
      );

    const streamSelection = selectedStream as LogStreamSelection;
    const clearScope = selectedScope as LogClearScope;

    let processDescriptions: ProcessDescription[];
    try {
      processDescriptions = await this.withPM2<ProcessDescription[]>((callback) =>
        pm2.describe(processId, (describeError, descriptions) => callback(describeError, descriptions ?? [])),
      );
    } catch (error) {
      return this.handleError(error);
    }

    const processDescription = processDescriptions[0];
    if (!processDescription)
      return respond<ProcessLogsClearResult>(`Process ${processId} not found`, null, {
        success: false,
        status: 404,
        code: "PROCESS_NOT_FOUND",
      });
    if (this.isAgentProcess(processDescription))
      return respond<ProcessLogsClearResult>("Refusing to manage the xpm-agent process itself", null, {
        success: false,
        status: 409,
        code: "AGENT_SELF_MANAGEMENT_FORBIDDEN",
      });

    const processEnvironment = processDescription.pm2_env;
    const targets: Array<{ key: "out" | "error"; path: string | undefined }> =
      streamSelection === "out"
        ? [{ key: "out", path: processEnvironment?.pm_out_log_path }]
        : streamSelection === "err"
          ? [{ key: "error", path: processEnvironment?.pm_err_log_path }]
          : [
              { key: "out", path: processEnvironment?.pm_out_log_path },
              { key: "error", path: processEnvironment?.pm_err_log_path },
            ];

    const truncated: ProcessLogSize = {};
    const deleted: ProcessLogsClearResult["deleted"] = {};
    let bytesFreed = 0;
    try {
      for (const { key, path: logPath } of targets) {
        if (clearScope === "active" || clearScope === "all") {
          const freed = await truncateLogFile(logPath);
          truncated[key] = freed;
          bytesFreed += freed;
        }
        if (clearScope === "rotated" || clearScope === "all") {
          const removed = await deleteRotatedLogFiles(logPath);
          deleted[key] = { count: removed.files.length, bytesFreed: removed.bytesFreed };
          bytesFreed += removed.bytesFreed;
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return respond<ProcessLogsClearResult>(`Log file operation failed: ${detail}`, null, {
        success: false,
        status: 500,
        code: "LOG_IO_FAILED",
      });
    }

    const summary = summarizeProcess(processDescription);
    return respond(`Process ${processId} logs cleared successfully`, {
      pm_id: summary.pm_id,
      name: summary.name,
      stream: streamSelection,
      scope: clearScope,
      truncated,
      deleted,
      bytesFreed,
    });
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
      if (type === "both" || type === "output") {
        info.out = await this.readLogFile(processEnvironment?.pm_out_log_path, tail);
        info.size = { ...info.size, out: await logStreamBytes(processEnvironment?.pm_out_log_path) };
      }
      if (type === "both" || type === "error") {
        info.error = await this.readLogFile(processEnvironment?.pm_err_log_path, tail);
        info.size = { ...info.size, error: await logStreamBytes(processEnvironment?.pm_err_log_path) };
      }
      return respond("PM2 process logs retrieved successfully", info);
    } catch (error) {
      return this.handleError(error);
    }
  };
}

export const processController = new ProcessController();