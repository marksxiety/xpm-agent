import { Elysia } from "elysia";
import type { Context } from "elysia";
import swagger from "@elysiajs/swagger";
import type { StartOptions } from "pm2";
import type { ApiResponse } from "./types";
import { respond } from "./utils/response";
import { classifyPm2Error, formatValidationMessage } from "./utils/errors";
import { pm2Service } from "./services/pm2.service";
import { getRouteMeta } from "./meta/process";

const handle = async <T>(set: Context["set"], task: () => ApiResponse<T> | Promise<ApiResponse<T>>) => {
  const response = await task();
  set.status = response.status;
  return response;
};

export const pm2Routes = new Elysia({ prefix: "/pm2" })
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return respond(`Validation failed: ${formatValidationMessage(error.message)}`, null, { success: false, status: 422 });
    }
    const { status, message } = classifyPm2Error(error);
    set.status = status;
    return respond(message, null, { success: false, status });
  })
  .get(
    "/list",
    ({ set }) => handle(set, () => pm2Service.listProcesses()),
    getRouteMeta("list"),
  )
  .get(
    "/health",
    ({ set }) => handle(set, () => pm2Service.healthCheck()),
    getRouteMeta("health"),
  )
  .get(
    "/describe/:id",
    ({ params, set }) => handle(set, () => pm2Service.describeProcess(params.id)),
    getRouteMeta("describe"),
  )
  .post(
    "/start",
    ({ body, set }) => handle(set, () => pm2Service.startProcess(body as StartOptions)),
    getRouteMeta("start"),
  )
  .post(
    "/stop/:id",
    ({ params, set }) => handle(set, () => pm2Service.stopProcess(params.id)),
    getRouteMeta("stop"),
  )
  .post(
    "/restart/:id",
    ({ params, set }) => handle(set, () => pm2Service.restartProcess(params.id)),
    getRouteMeta("restart"),
  )
  .post(
    "/reload/:id",
    ({ params, set }) => handle(set, () => pm2Service.reloadProcess(params.id)),
    getRouteMeta("reload"),
  )
  .delete(
    "/delete/:id",
    ({ params, set }) => handle(set, () => pm2Service.deleteProcess(params.id)),
    getRouteMeta("delete"),
  )
  .post(
    "/flush/:id?",
    ({ params, set }) => handle(set, () => pm2Service.flushLogs(params.id)),
    getRouteMeta("flush"),
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