import { findListeningPids, parseTasklistImageName } from "./port";

const NETSTAT_COMMAND = "netstat";
const TASKLIST_COMMAND = "tasklist";
const DEFAULT_STDIO = { stdin: "ignore", stdout: "pipe", stderr: "ignore" } as const;

// Returns the PIDs listening on the port, or undefined when the OS listener
// table is unavailable (non-Windows, command failure) so callers can fall back
// to a bind probe.
export function findListeningPidsOnHost(port: number): number[] | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const result = Bun.spawnSync({ cmd: [NETSTAT_COMMAND, "-ano"], ...DEFAULT_STDIO });
    if (result.exitCode !== 0) return undefined;
    return findListeningPids(result.stdout.toString(), port);
  } catch {
    return undefined;
  }
}

export function findProcessName(pid: number): string | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const result = Bun.spawnSync({
      cmd: [TASKLIST_COMMAND, "/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      ...DEFAULT_STDIO,
    });
    if (result.exitCode !== 0) return undefined;
    return parseTasklistImageName(result.stdout.toString());
  } catch {
    return undefined;
  }
}
