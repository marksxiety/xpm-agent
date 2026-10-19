import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { CONTENT_TYPE } from "./metrics";
import { collect, DEFAULT_TIMEOUT_MS, type Pm2ListAdapter } from "./pm2";

export type RequestHandlerOptions = {
  pm2: Pm2ListAdapter;
  log?: { error(message: string): void };
  now?: () => number;
  timeoutMs?: number;
};

export function createRequestHandler({
  pm2,
  log = console,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: RequestHandlerOptions) {
  return function handler(req: IncomingMessage, res: ServerResponse): void {
    const path = String(req.url || "").split("?")[0];

    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<html><body>PM2 metrics: <a href="/metrics">/metrics</a></body></html>',
      );
      return;
    }

    if (req.method === "GET" && path === "/metrics") {
      Promise.resolve()
        .then(() => collect({ pm2, now: now(), timeoutMs }))
        .then((body) => {
          res.writeHead(200, { "Content-Type": CONTENT_TYPE });
          res.end(body);
        })
        .catch((error: unknown) => {
          log.error(
            `[xpm-exporter] PM2 unreachable: ${errorMessage(error)}`,
          );
          res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("# PM2 unreachable; see xpm-exporter logs\n");
        });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  };
}

export function createServer(options: RequestHandlerOptions): http.Server {
  return http.createServer(createRequestHandler(options));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
