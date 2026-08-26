import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import type { StartOptions } from "pm2";
import type { ApiResponse } from "./types";
import { respond } from "./utils/response";
import { formatElysiaErrorResponse } from "./utils/errors";
import { pm2Service } from "./services/pm2.service";
import { getRouteMeta } from "./meta/process";
import { config } from "./config";
import PackageJson from "../package.json";

export const pm2Routes = new Elysia({ prefix: "/pm2" })
  .mapResponse(({ set, response }) => {
    if (response && typeof response === "object" && "status" in response) {
      set.status = (response as ApiResponse).status;
      delete (response as { status?: unknown }).status;
    }
  })
  .onError(({ code, error }) => formatElysiaErrorResponse(code, error))
  .get("/list", ({ query }) => pm2Service.listProcesses(query.logs), getRouteMeta("list"))
  .get("/health", () => pm2Service.healthCheck(), getRouteMeta("health"))
  .get("/describe/:id", ({ params }) => pm2Service.describeProcess(params.id), getRouteMeta("describe"))
  .post("/start", ({ body }) => pm2Service.startProcess(body as StartOptions), getRouteMeta("start"))
  .post("/stop/:id", ({ params }) => pm2Service.stopProcess(params.id), getRouteMeta("stop"))
  .post("/restart/:id", ({ params }) => pm2Service.restartProcess(params.id), getRouteMeta("restart"))
  .post("/reload/:id", ({ params }) => pm2Service.reloadProcess(params.id), getRouteMeta("reload"))
  .delete("/delete/:id", ({ params, query }) => pm2Service.deleteProcess(params.id, query.delete_logs ?? false), getRouteMeta("delete"))
  .post("/flush/:id?", ({ params }) => pm2Service.flushLogs(params.id), getRouteMeta("flush"))
  .get("/logs/:id", ({ params, query }) => pm2Service.getLogs(params.id, query.tail, query.type), getRouteMeta("logs"));

export const createApp = () =>
  new Elysia()
    .onRequest(({ request, set }) => {
      const origin = request.headers.get("Origin");
      if (origin && !config.CORS_ORIGIN.includes(origin)) {
        set.status = 403;
        return respond("Origin not allowed by CORS policy", null, {
          success: false,
          status: 403,
          code: "CORS_ORIGIN_NOT_ALLOWED",
        });
      }
    })
    .use(cors({ origin: config.CORS_ORIGIN }))
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
    .use(pm2Routes);

if (import.meta.main) {
  const app = createApp().listen(config.SERVER_PORT);
  console.log(`PM2 API is running at ${app.server?.hostname}:${app.server?.port}`);
}