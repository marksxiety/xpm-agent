export const STARTUP_ERROR_EXIT_CODE = 2;

const MIN_PORT = 1;
const MAX_PORT = 65535;

export type PortResolution = { ok: true; port: number } | { ok: false; message: string };

export function resolveServerPort(raw: string | undefined): PortResolution {
  const value = raw?.trim();
  if (!value) {
    return {
      ok: false,
      message: "SERVER_PORT is not set — define it in .env or .env.production (e.g. SERVER_PORT=4000)",
    };
  }
  if (!/^\d+$/.test(value)) {
    return {
      ok: false,
      message: `SERVER_PORT must be a whole number between ${MIN_PORT} and ${MAX_PORT} (received "${raw}")`,
    };
  }
  const port = Number(value);
  if (port < MIN_PORT || port > MAX_PORT) {
    return {
      ok: false,
      message: `SERVER_PORT must be between ${MIN_PORT} and ${MAX_PORT} (received "${raw}")`,
    };
  }
  return { ok: true, port };
}

function isAddressInUseError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "EADDRINUSE") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /EADDRINUSE|address already in use|port \d+.*in use/i.test(message);
}

export function formatPortError(port: number, error: unknown): string {
  if (isAddressInUseError(error)) {
    return `port ${port} is already in use — stop the process using it or set a different SERVER_PORT`;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `unable to bind port ${port}: ${detail}`;
}
