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

export function formatPortInUseError(port: number, pid?: number, processName?: string): string {
  if (pid === undefined) {
    return `port ${port} is already in use — stop the process using it or set a different SERVER_PORT`;
  }
  const owner = processName ? `PID ${pid} (${processName})` : `PID ${pid}`;
  return `port ${port} is already in use by ${owner} — stop that process or set a different SERVER_PORT`;
}

export function formatPortError(port: number, error: unknown): string {
  if (isAddressInUseError(error)) return formatPortInUseError(port);
  const detail = error instanceof Error ? error.message : String(error);
  return `unable to bind port ${port}: ${detail}`;
}

// Windows reports listeners on a port regardless of interface (0.0.0.0, [::], a
// specific NIC address) with the foreign address ending in ":0". Established and
// TIME_WAIT rows have a real foreign port and are ignored, so restarts on a port
// with lingering connections are not flagged as conflicts.
export function findListeningPids(netstatOutput: string, port: number): number[] {
  const portSuffix = `:${port}`;
  const pids = new Set<number>();
  for (const line of netstatOutput.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5) continue;
    const protocol = columns[0]?.toUpperCase();
    if (protocol !== "TCP" && protocol !== "TCPV6") continue;
    const localAddress = columns[1] ?? "";
    const foreignAddress = columns[2] ?? "";
    if (!localAddress.endsWith(portSuffix)) continue;
    if (!foreignAddress.endsWith(":0")) continue;
    const pid = Number(columns[4]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    pids.add(pid);
  }
  return [...pids];
}

export function parseTasklistImageName(tasklistOutput: string): string | undefined {
  return tasklistOutput.match(/^"([^"]+)"/m)?.[1];
}
