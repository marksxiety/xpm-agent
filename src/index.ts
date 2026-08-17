import { Elysia, t } from "elysia";
import swagger from "@elysiajs/swagger";
import pm2 from "pm2";
import type { ProcessDescription, StartOptions } from "pm2";
import type { ProcessSummary } from "./types";
import { SuccessResponse } from "./utils/response";
import { classifyPm2Error, formatValidationMessage } from "./utils/errors";
import { summarizeProcess, toProcessDescriptions } from "./utils/process";

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
  })

}

export const pm2Service = new PM2Service();

export const pm2Routes = new Elysia({ prefix: "/pm2" })
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return {
        success: false,
        message: `Validation failed: ${formatValidationMessage(error.message)}`,
        info: null,
      };
    }
    const { status, message } = classifyPm2Error(error);
    set.status = status;
    return { success: false, message, info: null };
  })
  .get(
    "/list",
    async () => SuccessResponse("PM2 process list retrieved successfully", await pm2Service.listProcesses()),
    {
      detail: {
        summary: "List all PM2 processes",
        description:
          "Returns all PM2-managed processes with live CPU, memory, restart counts, and status. Use this first to discover the `pm_id` values required by other routes.",
        tags: ["Processes"],
        operationId: "listProcesses",
      },
    },
  )
  .get(
    "/health",
    () => SuccessResponse("PM2 health check passed", pm2Service.healthCheck()),
    {
      detail: {
        summary: "API health check",
        description:
          "Liveness check for this API server itself (not the PM2 processes). Useful for uptime monitoring and load balancer probes.",
        tags: ["System"],
        operationId: "healthCheck",
      },
    },
  )
  .get(
    "/describe/:id",
    async ({ params }) => SuccessResponse("PM2 process described successfully", await pm2Service.describeProcess(params.id)),
    {
      params: t.Object({ id: t.Number({ description: "pm_id of the process (see GET /list)" }) }),
      detail: {
        summary: "Get details of one process",
        description:
          "Fetches detailed info for a single process by its `pm_id`. Unlike `/list`, returns 404 if the id does not exist.",
        tags: ["Processes"],
        operationId: "describeProcess",
      },
    },
  )
  .post(
    "/start",
    async ({ body }) => SuccessResponse("PM2 process started successfully", await pm2Service.startProcess(body as StartOptions)),
    {
      body: t.Object({
        script: t.String({
          description: "Path to the script to run (required)",
          examples: ["C:\\apps\\my-service\\index.js"],
        }),
        name: t.Optional(t.String({
          description: "Process name shown in pm2 list",
          examples: ["my-service"],
        })),
        namespace: t.Optional(t.String({
          description: "PM2 namespace (defaults to 'default'). Use to isolate same-named processes.",
          examples: ["default"],
        })),
        cwd: t.Optional(t.String({
          description: "Working directory for the script",
          examples: ["C:\\apps\\my-service"],
        })),
        instances: t.Optional(t.Union([t.Number(), t.String()], {
          description: "Number of instances (cluster mode). One row is returned per instance. Requires exec_mode 'cluster'.",
          examples: [1, 2, "max"],
        })),
        exec_mode: t.Optional(t.Union([t.Literal("fork"), t.Literal("cluster")], {
          description: "Execution mode. 'cluster' is required for instances > 1 (Node only). 'fork' (default) for a single process.",
          examples: ["fork"],
        })),
        interpreter: t.Optional(t.String({
          description: "Interpreter to use, e.g. 'node', 'bun', 'python', 'php', or 'none' for an executable/binary/script.",
          examples: ["node", "none", "python", "php"],
        })),
        node_args: t.Optional(t.Union([t.String(), t.Array(t.String())], {
          description: "Arguments passed to the interpreter itself (Node/Bun only), e.g. '--env-file=.env'.",
          examples: ["--env-file=.env"],
        })),
        args: t.Optional(t.Union([t.String(), t.Array(t.String())], {
          description: "Arguments passed to the script itself, e.g. PHP built-in server flags.",
          examples: ["-S 127.0.0.1:8080 server.php", "--port 5000"],
        })),
        env: t.Optional(t.Record(t.String(), t.String(), {
          description: "Environment variables injected into the spawned process.",
          examples: [{ NODE_ENV: "production", PORT: "3000" }],
        })),
        watch: t.Optional(t.Boolean({
          description: "Restart on file changes",
          examples: [false],
        })),
        autorestart: t.Optional(t.Boolean({
          description: "Restart automatically on crash",
          examples: [true],
        })),
        cron_restart: t.Optional(t.String({
          description: "Cron expression to periodically restart the process, e.g. '*/5 * * * *'.",
          examples: ["*/5 * * * *"],
        })),
      }),
      detail: {
        summary: "Register and start a new process",
        description:
          "Registers and launches a new process under PM2. `script` is required; other fields are PM2 start options. PM2 will keep the process alive according to its `autorestart`/`watch` settings.\n\nLanguage recipes:\n- **Node**: `script: index.js`, `interpreter: node`, `node_args: --env-file=.env`\n- **Bun**: `script: index.ts`, `interpreter: bun`\n- **PHP**: `script: server.php`, `interpreter: php`, `args: -S 127.0.0.1:8080`\n- **Python**: `script: app.py`, `interpreter: python`, `args: --port 5000`\n- **Go/binary**: `script: ./my-binary`, `interpreter: none`\n\nThe response `info` is always an array — one `ProcessSummary` per launched instance.",
        tags: ["Processes"],
        operationId: "startProcess",
      },
    },
  )
  .post(
    "/stop/:id",
    async ({ params }) => SuccessResponse("PM2 process stopped successfully", await pm2Service.stopProcess(params.id)),
    {
      params: t.Object({ id: t.Number({ description: "pm_id of the process (see GET /list)" }) }),
      detail: {
        summary: "Stop a process",
        description:
          "Gracefully stops a running process. The process stays **registered** in PM2 (status 'stopped') and can be started again via restart. To remove it entirely, use DELETE /delete/:id.",
        tags: ["Processes"],
        operationId: "stopProcess",
      },
    },
  )
  .post(
    "/restart/:id",
    async ({ params }) => SuccessResponse("PM2 process restarted successfully", await pm2Service.restartProcess(params.id)),
    {
      params: t.Object({ id: t.Number({ description: "pm_id of the process (see GET /list)" }) }),
      detail: {
        summary: "Restart a process",
        description:
          "Kills and re-launches a process. Also works on stopped processes (acts as start). Use after code or environment changes.",
        tags: ["Processes"],
        operationId: "restartProcess",
      },
    },
  )
  .post(
    "/reload/:id",
    async ({ params }) => SuccessResponse("PM2 process reloaded successfully", await pm2Service.reloadProcess(params.id)),
    {
      params: t.Object({ id: t.Number({ description: "pm_id of the process (see GET /list)" }) }),
      detail: {
        summary: "Zero-downtime reload",
        description:
          "Reloads a process without downtime by restarting instances one at a time. Only meaningful for **cluster mode** processes with multiple instances; falls back to a normal restart in fork mode.",
        tags: ["Processes"],
        operationId: "reloadProcess",
      },
    },
  )
  .delete(
    "/delete/:id",
    async ({ params }) => SuccessResponse("PM2 process deleted successfully", await pm2Service.deleteProcess(params.id)),
    {
      params: t.Object({ id: t.Number({ description: "pm_id of the process (see GET /list)" }) }),
      detail: {
        summary: "Delete a process permanently",
        description:
          "Stops the process **and removes it from PM2's registry entirely**. The `pm_id` is freed and may be recycled by PM2 for future processes. Unlike stop, this cannot be undone via restart.",
        tags: ["Processes"],
        operationId: "deleteProcess",
      },
    },
  )
  .post(
    "/flush/:id?",
    async ({ params }) => SuccessResponse("PM2 logs flushed successfully", await pm2Service.flushLogs(params.id)),
    {
      params: t.Object({ id: t.Optional(t.Number({ description: "pm_id of the process; omit to flush ALL processes" })) }),
      detail: {
        summary: "Flush (empty) log files",
        description:
          "Clears (empties) the log files for one process, or for **all** processes if the id is omitted. Does not affect running state.",
        tags: ["Processes"],
        operationId: "flushLogs",
      },
    },
  );
const port = Number(process.env.SERVER_PORT ?? 4000);

const app = new Elysia()
  .use(
    swagger({
      documentation: {
        info: {
          title: "PM2 Process Manager API",
          version: "1.0.0",
          description: "REST API for managing PM2 processes. Identify processes by their numeric pm_id (see GET /pm2/list).",
        },
      },
    }),
  )
  .use(pm2Routes)
  .listen(port);

console.log(`PM2 API is running at ${app.server?.hostname}:${app.server?.port}`);
