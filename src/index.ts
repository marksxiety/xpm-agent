import { Elysia } from "elysia";
import swagger from "@elysiajs/swagger";
import type { StartOptions } from "pm2";
import { SuccessResponse } from "./utils/response";
import { classifyPm2Error, formatValidationMessage } from "./utils/errors";
import { pm2Service } from "./services/pm2.service";
import { getRouteMeta } from "./meta/process";

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
    getRouteMeta("list"),
  )
  .get(
    "/health",
    () => SuccessResponse("PM2 health check passed", pm2Service.healthCheck()),
    getRouteMeta("health"),
  )
  .get(
    "/describe/:id",
    async ({ params }) => SuccessResponse("PM2 process described successfully", await pm2Service.describeProcess(params.id)),
    getRouteMeta("describe"),
  )
  .post(
    "/start",
    async ({ body }) => SuccessResponse("PM2 process started successfully", await pm2Service.startProcess(body as StartOptions)),
    getRouteMeta("start"),
  )
  .post(
    "/stop/:id",
    async ({ params }) => SuccessResponse("PM2 process stopped successfully", await pm2Service.stopProcess(params.id)),
    getRouteMeta("stop"),
  )
  .post(
    "/restart/:id",
    async ({ params }) => SuccessResponse("PM2 process restarted successfully", await pm2Service.restartProcess(params.id)),
    getRouteMeta("restart"),
  )
  .post(
    "/reload/:id",
    async ({ params }) => SuccessResponse("PM2 process reloaded successfully", await pm2Service.reloadProcess(params.id)),
    getRouteMeta("reload"),
  )
  .delete(
    "/delete/:id",
    async ({ params }) => SuccessResponse("PM2 process deleted successfully", await pm2Service.deleteProcess(params.id)),
    getRouteMeta("delete"),
  )
  .post(
    "/flush/:id?",
    async ({ params }) => SuccessResponse("PM2 logs flushed successfully", await pm2Service.flushLogs(params.id)),
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
