import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import type { StartOptions } from "pm2";
import type { ApiResponse } from "./types";
import { respond } from "./utils/response";
import { classifyPm2Error, formatValidationMessage } from "./utils/errors";
import { ELYSIA_CODE_MAP, ERROR_CODES, type ErrorCode } from "./types/error";
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
      return respond(`Validation failed: ${formatValidationMessage(error.message)}`, null, {
        success: false,
        status: 422,
        code: "VALIDATION_FAILED",
      });
    }
    const mappedCode = ELYSIA_CODE_MAP[code] as ErrorCode | undefined;
    if (mappedCode) {
      const descriptor = ERROR_CODES[mappedCode];
      const appendsDetail = mappedCode === "INTERNAL_SERVER_ERROR" || mappedCode === "UNKNOWN";
      const detail =
        appendsDetail && error instanceof Error && error.message.length > 0 ? `: ${error.message}` : "";
      return respond(`${descriptor.message}${detail}`, null, { success: false, status: descriptor.status, code: mappedCode });
    }
    const classified = classifyPm2Error(error);
    return respond(classified.message, null, { success: false, status: classified.status, code: classified.code });
  })
  .get("/list", () => pm2Service.listProcesses(), getRouteMeta("list"))
  .get("/health", () => pm2Service.healthCheck(), getRouteMeta("health"))
  .get("/describe/:id", ({ params }) => pm2Service.describeProcess(params.id), getRouteMeta("describe"))
  .post("/start", ({ body }) => pm2Service.startProcess(body as StartOptions), {
    ...getRouteMeta("start"),
    body: StartPayload,
  })
  .post("/stop/:id", ({ params }) => pm2Service.stopProcess(params.id), getRouteMeta("stop"))
  .post("/restart/:id", ({ params }) => pm2Service.restartProcess(params.id), getRouteMeta("restart"))
  .post("/reload/:id", ({ params }) => pm2Service.reloadProcess(params.id), getRouteMeta("reload"))
  .delete("/delete/:id", ({ params, body }) => pm2Service.deleteProcess(params.id, body?.delete_logs ?? false), getRouteMeta("delete"))
  .post("/flush/:id?", ({ params }) => pm2Service.flushLogs(params.id), getRouteMeta("flush"));

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