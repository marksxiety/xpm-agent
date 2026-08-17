import pm2 from "pm2";
import type { ProcessDescription, StartOptions } from "pm2";
import type { ProcessSummary } from "../types";
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

  listProcesses = (): Promise<ProcessSummary[]> =>
    this.withPM2<ProcessSummary[]>((cb) =>
      pm2.list((err, list) => cb(err, list?.map(summarizeProcess))),
    );

  describeProcess = async (processId: number): Promise<ProcessSummary[]> => {
    const list = await this.withPM2<ProcessSummary[]>((cb) =>
      pm2.describe(processId, (err, l) => cb(err, l?.map(summarizeProcess))),
    );
    if (list.length === 0) throw new Error(`Process ${processId} not found`);
    return list;
  };

  startProcess = async (options: StartOptions): Promise<ProcessSummary[]> => {
    const launched = await this.withPM2<ProcessDescription[]>((cb) =>
      pm2.start(options, (err, procs) => cb(err, toProcessDescriptions(procs))),
    );
    const ids = launched
      .map((p) => p.pm_id ?? (p.pm2_env as any)?.pm_id)
      .filter((id): id is number => typeof id === "number" && id >= 0);
    if (ids.length === 0) return launched.map(summarizeProcess);
    const list = await this.listProcesses();
    return list.filter((p) => ids.includes(p.pm_id));
  };

  stopProcess = (processId: number): Promise<ProcessSummary[]> =>
    this.withPM2<ProcessSummary[]>((cb) =>
      pm2.stop(processId, (err, procs) => cb(err, toProcessDescriptions(procs).map(summarizeProcess))),
    );

  restartProcess = (processId: number): Promise<ProcessSummary[]> =>
    this.withPM2<ProcessSummary[]>((cb) =>
      pm2.restart(processId, (err, procs) => cb(err, toProcessDescriptions(procs).map(summarizeProcess))),
    );

  reloadProcess = (processId: number): Promise<ProcessSummary[]> =>
    this.withPM2<ProcessSummary[]>((cb) =>
      pm2.reload(processId, (err, procs) => cb(err, toProcessDescriptions(procs).map(summarizeProcess))),
    );

  deleteProcess = (processId: number): Promise<ProcessSummary[]> =>
    this.withPM2<ProcessSummary[]>((cb) =>
      pm2.delete(processId, (err, procs) => cb(err, toProcessDescriptions(procs).map(summarizeProcess))),
    );

  flushLogs = (processId?: number): Promise<void> =>
    this.withPM2<void>((cb) => pm2.flush(processId as number, cb));

  healthCheck = () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

export const pm2Service = new PM2Service();
