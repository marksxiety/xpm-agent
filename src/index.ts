import { Elysia } from "elysia";
import swagger from "@elysiajs/swagger";
import type { StartOptions } from "pm2";
import type { ApiResponse } from "./types";
import { respond } from "./utils/response";
import { classifyPm2Error, formatValidationMessage } from "./utils/errors";
import { inspect } from "./utils/inspect";
import { pm2Service } from "./services/pm2.service";
import { getRouteMeta } from "./meta/process";
import { StartPayload } from "./schemas/process";
import { config } from "./config";
import PackageJson from "../package.json";

export const pm2Routes = new Elysia({ prefix: "/pm2" })
  .mapResponse(({ set, response }) => {
    if (response && typeof response === "object" && "status" in response) {
      set.status = (response as ApiResponse).status;
      delete (response as { status?: unknown }).status;
    }
  })
  .onError(({ code, error }) => {
    if (code === "VALIDATION") {
      return respond(`Validation failed: ${formatValidationMessage(error.message)}`, null, { success: false, status: 422 });
    }
    const { status, message } = classifyPm2Error(error);
    return respond(message, null, { success: false, status });
  })
  .get("/list", () => pm2Service.listProcesses(), getRouteMeta("list"))
  .get("/health", () => pm2Service.healthCheck(), getRouteMeta("health"))
  .get("/describe/:id", ({ params }) => pm2Service.describeProcess(params.id), getRouteMeta("describe"))
  .post("/start", ({ body }) => {
    const issues = inspect("start", body);
    if (issues.length > 0) {
      return respond("Invalid process configuration", issues, { success: false, status: 422 });
    }
    return pm2Service.startProcess(body as StartOptions);
  }, { ...getRouteMeta("start"), body: StartPayload })
  .post("/stop/:id", ({ params }) => pm2Service.stopProcess(params.id), getRouteMeta("stop"))
  .post("/restart/:id", ({ params }) => pm2Service.restartProcess(params.id), getRouteMeta("restart"))
  .post("/reload/:id", ({ params }) => pm2Service.reloadProcess(params.id), getRouteMeta("reload"))
  .delete("/delete/:id", ({ params, body }) => pm2Service.deleteProcess(params.id, body?.delete_logs ?? false), getRouteMeta("delete"))
  .post("/flush/:id?", ({ params }) => pm2Service.flushLogs(params.id), getRouteMeta("flush"));

const app = new Elysia()
  .use(
    swagger({
      documentation: {
        info: {
          title: "Process Manager API",
          version: PackageJson.version ?? '',
          description: "REST API for managing PM2 processes. Identify processes by their numeric pm_id (see GET /pm2/list).",
        },
      },
    }),
  )
  .use(pm2Routes)
  .listen(config.SERVER_PORT);

console.log(`PM2 API is running at ${app.server?.hostname}:${app.server?.port}`);