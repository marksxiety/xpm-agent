import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";

const NETSTAT_COMMAND = "netstat";
const TASKLIST_COMMAND = "tasklist";
const EXEC_OPTIONS: ExecFileSyncOptionsWithStringEncoding = {
  encoding: "utf8",
  windowsHide: true,
  stdio: ["ignore", "pipe", "ignore"],
};

// Same listener-detection rules as the agent's src/utils/port.ts: Windows
// reports listeners on the port regardless of interface (0.0.0.0, [::], a
// specific NIC address) with the foreign address ending in ":0". Established
// and TIME_WAIT rows have a real foreign port and are ignored, so restarts on
// a port with lingering connections are not flagged as conflicts.
export function findListeningPids(
  netstatOutput: string,
  port: number,
): number[] {
  const portSuffix = `:${port}`;
  const pids = new Set<number>();
  for (const line of netstatOutput.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5) continue;
    const protocol = String(columns[0] || "").toUpperCase();
    if (protocol !== "TCP" && protocol !== "TCPV6") continue;
    const localAddress = columns[1] || "";
    const foreignAddress = columns[2] || "";
    if (!localAddress.endsWith(portSuffix)) continue;
    if (!foreignAddress.endsWith(":0")) continue;
    const pid = Number(columns[4]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    pids.add(pid);
  }
  return [...pids];
}

export function parseTasklistImageName(
  tasklistOutput: string,
): string | undefined {
  return tasklistOutput.match(/^"([^"]+)"/m)?.[1];
}

// Returns the PIDs listening on the port, or undefined when the OS listener
// table is unavailable (non-Windows, command failure), so main() can fall back
// to the bind error reported by the server.
function findListeningPidsOnHost(port: number): number[] | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const output = execFileSync(NETSTAT_COMMAND, ["-ano"], EXEC_OPTIONS);
    return findListeningPids(output, port);
  } catch {
    return undefined;
  }
}

function findProcessName(pid: number): string | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const output = execFileSync(
      TASKLIST_COMMAND,
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      EXEC_OPTIONS,
    );
    return parseTasklistImageName(output);
  } catch {
    return undefined;
  }
}

export function formatPortInUseError(
  port: number,
  pid?: number,
  processName?: string,
): string {
  if (pid === undefined) {
    return `port ${port} is already in use — stop the process using it or set a different EXPORTER_PORT`;
  }
  const owner = processName ? `PID ${pid} (${processName})` : `PID ${pid}`;
  return `port ${port} is already in use by ${owner} — stop that process or set a different EXPORTER_PORT`;
}

// Throws when a listener already owns the port. The check is skipped when the
// OS listener table is unavailable; binding still fails safely in that case.
export function assertPortAvailable(port: number): void {
  const pids = findListeningPidsOnHost(port);
  if (pids === undefined || pids.length === 0) return;
  const [pid] = pids;
  const processName = pid === undefined ? undefined : findProcessName(pid);
  throw new Error(formatPortInUseError(port, pid, processName));
}
