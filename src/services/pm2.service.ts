import pm2 from "pm2";
import type { ProcessDescription, StartOptions } from "pm2";
import type { ApiResponse, ProcessSummary } from "../types";
import { respond } from "../utils/response";
import { classifyPm2Error } from "../utils/errors";
import { summarizeProcess, toProcessDescriptions } from "../utils/process";

class PM2Service {
  private withPM2<T>(fn: (cb: (err: Error | null, result?: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) return reject(err);
        fn((opErr, result) => {
          pm2.disconnect();
          if (opErr) reject(opErr);
          else resolve(result as T);
        });
      });
    });
  }

  private handleError<T>(err: unknown): ApiResponse<T> {
    const { status, message } = classifyPm2Error(err);
    return respond(message, null, { success: false, status });
  }

  listProcesses = async (): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const list = await this.withPM2<ProcessSummary[]>((cb) =>
        pm2.list((err, l) => cb(err, l?.map(summarizeProcess))),
      );
      return respond("PM2 process list retrieved successfully", list);
    } catch (err) {
      return this.handleError(err);
    }
  };

  describeProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const list = await this.withPM2<ProcessSummary[]>((cb) =>
        pm2.describe(processId, (err, l) => cb(err, l?.map(summarizeProcess))),
      );
      if (list.length === 0) throw new Error(`Process ${processId} not found`);
      return respond("PM2 process described successfully", list);
    } catch (err) {
      return this.handleError(err);
    }
  };

  startProcess = async (options: StartOptions): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const launched = await this.withPM2<ProcessDescription[]>((cb) =>
        pm2.start(options, (err, procs) => cb(err, toProcessDescriptions(procs))),
      );
      const ids = launched
        .map((p) => p.pm_id ?? (p.pm2_env as any)?.pm_id)
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

  deleteProcess = async (processId: number): Promise<ApiResponse<ProcessSummary[]>> => {
    try {
      const procs = await this.withPM2<ProcessDescription[]>((cb) =>
        pm2.delete(processId, (err, p) => cb(err, toProcessDescriptions(p))),
      );
      return respond("PM2 process deleted successfully", procs.map(summarizeProcess));
    } catch (err) {
      return this.handleError(err);
    }
  };

  flushLogs = async (processId?: number): Promise<ApiResponse<null>> => {
    try {
      await this.withPM2<void>((cb) => pm2.flush(processId as number, cb));
      return respond("PM2 logs flushed successfully", null);
    } catch (err) {
      return this.handleError(err);
    }
  };

  healthCheck = (): ApiResponse<{ status: string; uptime: number; timestamp: string }> =>
    respond("PM2 health check passed", {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
}

export const pm2Service = new PM2Service();