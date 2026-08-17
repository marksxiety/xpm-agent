import { Elysia } from "elysia";
import pm2 from "pm2";
import type { ProcessDescription, Proc, StartOptions } from "pm2";

interface ProcessSummary {
  pid: number;
  pm_id: number;
  name: string;
  namespace: string;
  status: string;
  uptime: number | undefined;
  restarts: number;
  unstable_restarts: number;
  exec_mode: string;
  instances: number | undefined;
  interpreter: string;
  cpu: number;
  memory: number;
  cwd: string | undefined;
  watch: boolean;
  autorestart: boolean | undefined;
}

function summarizeProcess(process: ProcessDescription): ProcessSummary {
  const env = process.pm2_env as any;
  return {
    pid: process.pid ?? 0,
    pm_id: process.pm_id ?? -1,
    name: process.name ?? "",
    namespace: env?.namespace ?? "default",
    status: env?.status ?? "unknown",
    uptime: env?.pm_uptime,
    restarts: env?.restart_time ?? 0,
    unstable_restarts: env?.unstable_restarts ?? 0,
    exec_mode: env?.exec_mode ?? "fork",
    instances: env?.instances,
    interpreter: env?.exec_interpreter ?? "none",
    cpu: process.monit?.cpu ?? 0,
    memory: process.monit?.memory ?? 0,
    cwd: env?.pm_cwd,
    watch: Boolean(env?.watch),
    autorestart: env?.autorestart,
  };
}

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

  describeProcess = (processName: string): Promise<ProcessSummary[]> =>
    this.withPM2<ProcessSummary[]>((cb) =>
      pm2.describe(processName, (err, list) => cb(err, list?.map(summarizeProcess))),
    );

  startProcess = (options: StartOptions): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.start(options, cb));

  stopProcess = (processName: string): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.stop(processName, cb));

  restartProcess = (processName: string): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.restart(processName, cb));

  reloadProcess = (processName: string): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.reload(processName, cb));

  deleteProcess = (processName: string): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.delete(processName, cb));

  flushLogs = (processName?: string): Promise<void> =>
    this.withPM2<void>((cb) => pm2.flush(processName as string, cb));

  healthCheck = () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
    
}

export const pm2Service = new PM2Service();

export const pm2Routes = new Elysia({ prefix: "/pm2" })
  .get("/list", () => pm2Service.listProcesses())
  .get("/health", () => pm2Service.healthCheck())
  .get("/describe/:name", ({ params }) => pm2Service.describeProcess(params.name))
  .post("/start", ({ body }) => pm2Service.startProcess(body as StartOptions))
  .post("/stop/:name", ({ params }) => pm2Service.stopProcess(params.name))
  .post("/restart/:name", ({ params }) => pm2Service.restartProcess(params.name))
  .post("/reload/:name", ({ params }) => pm2Service.reloadProcess(params.name))
  .delete("/delete/:name", ({ params }) => pm2Service.deleteProcess(params.name))
  .post("/flush/:name?", ({ params }) => pm2Service.flushLogs(params.name));

const port = Number(process.env.SERVER_PORT ?? 4000);

const app = new Elysia().use(pm2Routes).listen(port);

console.log(`P2M API is running at ${app.server?.hostname}:${app.server?.port}`);
