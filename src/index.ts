import { Elysia } from "elysia";
import pm2 from "pm2";
import type { ProcessDescription, Proc, StartOptions } from "pm2";

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

  listProcesses = (): Promise<ProcessDescription[]> =>
    this.withPM2<ProcessDescription[]>((cb) => pm2.list(cb));

  describeProcess = (processName: string): Promise<ProcessDescription[]> =>
    this.withPM2<ProcessDescription[]>((cb) => pm2.describe(processName, cb));

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
}

export const pm2Service = new PM2Service();

export const pm2Routes = new Elysia({ prefix: "/pm2" })
  .get("/list", () => pm2Service.listProcesses())
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
