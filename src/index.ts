import { Elysia, t, ValidationError } from "elysia";
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

interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  info: T
}

const SuccessResponse = <T>(message: string, info: T): ApiResponse<T> => ({
  success: true,
  message,
  info,
});

function classifyPm2Error(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String((err as any)?.msg ?? err);
  const text = raw.toLowerCase();

  if (/process.*not found|process or namespace not found|app not found|no process found/.test(text))
    return { status: 404, message: "Process not found" };
  if (/script not found/.test(text))
    return { status: 400, message: "Script not found — check the 'script' path in your request" };
  if (/econnrefused|connect|etimedout|daemon/.test(text))
    return { status: 503, message: "Cannot connect to PM2 daemon" };

  console.error("PM2 error:", raw);
  return { status: 500, message: `PM2 operation failed: ${raw}` };
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

  describeProcess = (processId: number): Promise<ProcessSummary[]> =>
    this.withPM2<ProcessSummary[]>((cb) =>
      pm2.describe(processId, (err, list) => cb(err, list?.map(summarizeProcess))),
    );

  startProcess = (options: StartOptions): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.start(options, cb));

  stopProcess = (processId: number): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.stop(processId, cb));

  restartProcess = (processId: number): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.restart(processId, cb));

  reloadProcess = (processId: number): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.reload(processId, cb));

  deleteProcess = (processId: number): Promise<Proc> =>
    this.withPM2<Proc>((cb) => pm2.delete(processId, cb));

  flushLogs = (processId?: number): Promise<void> =>
    this.withPM2<void>((cb) => pm2.flush(processId as number, cb));

  healthCheck = () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })

}

export const pm2Service = new PM2Service();

export const pm2Routes = new Elysia({ prefix: "/pm2" })
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return { success: false, message: `Validation failed: ${error.message}`, info: null };
    }
    const { status, message } = classifyPm2Error(error);
    set.status = status;
    return { success: false, message, info: null };
  })
  .get("/list", () => SuccessResponse("PM2 process list retrieved successfully", pm2Service.listProcesses()))
  .get("/health", () => SuccessResponse("PM2 health check passed", pm2Service.healthCheck()))
  .get(
    "/describe/:id",
    ({ params }) => SuccessResponse("PM2 process described successfully", pm2Service.describeProcess(params.id)),
    { params: t.Object({ id: t.Number() }) },
  )
  .post("/start", ({ body }) => SuccessResponse("PM2 process started successfully", pm2Service.startProcess(body as StartOptions)))
  .post(
    "/stop/:id",
    ({ params }) => SuccessResponse("PM2 process stopped successfully", pm2Service.stopProcess(params.id)),
    { params: t.Object({ id: t.Number() }) },
  )
  .post(
    "/restart/:id",
    ({ params }) => SuccessResponse("PM2 process restarted successfully", pm2Service.restartProcess(params.id)),
    { params: t.Object({ id: t.Number() }) },
  )
  .post(
    "/reload/:id",
    ({ params }) => SuccessResponse("PM2 process reloaded successfully", pm2Service.reloadProcess(params.id)),
    { params: t.Object({ id: t.Number() }) },
  )
  .delete(
    "/delete/:id",
    ({ params }) => SuccessResponse("PM2 process deleted successfully", pm2Service.deleteProcess(params.id)),
    { params: t.Object({ id: t.Number() }) },
  )
  .post(
    "/flush/:id?",
    ({ params }) => SuccessResponse("PM2 logs flushed successfully", pm2Service.flushLogs(params.id)),
    { params: t.Object({ id: t.Optional(t.Number()) }) },
  );
const port = Number(process.env.SERVER_PORT ?? 4000);

const app = new Elysia().use(pm2Routes).listen(port);

console.log(`PM2 API is running at ${app.server?.hostname}:${app.server?.port}`);
