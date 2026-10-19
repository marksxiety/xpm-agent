import path from "node:path";

export const ENV_FILE = path.join(__dirname, "..", ".env");

export type ExporterConfig = {
  port: number;
  host: string;
  timeoutMs: number;
};

export function parseConfig(
  env: Record<string, string | undefined> = process.env,
): ExporterConfig {
  const rawPort = env.EXPORTER_PORT;
  const portText = rawPort === undefined ? "" : String(rawPort).trim();
  if (portText === "") {
    throw new Error(
      "EXPORTER_PORT is not set — define it in exporter/.env (e.g. EXPORTER_PORT=9209)",
    );
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid EXPORTER_PORT "${rawPort}" (expected an integer between 1 and 65535)`,
    );
  }

  const rawHost = env.EXPORTER_HOST;
  const host = rawHost === undefined ? "" : String(rawHost).trim();
  if (host === "") {
    throw new Error(
      "EXPORTER_HOST is not set — define it in exporter/.env (e.g. EXPORTER_HOST=0.0.0.0)",
    );
  }

  const rawTimeout = env.EXPORTER_TIMEOUT_MS;
  const timeoutText =
    rawTimeout === undefined ? "" : String(rawTimeout).trim();
  if (timeoutText === "") {
    throw new Error(
      "EXPORTER_TIMEOUT_MS is not set — define it in exporter/.env (e.g. EXPORTER_TIMEOUT_MS=5000)",
    );
  }
  const timeoutMs = Number(timeoutText);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error(
      `Invalid EXPORTER_TIMEOUT_MS "${rawTimeout}" (expected a positive integer)`,
    );
  }

  return { port, host, timeoutMs };
}
