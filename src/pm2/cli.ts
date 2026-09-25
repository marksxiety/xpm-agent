const AGENT_NAME = "xpm-agent";
const AGENT_NAMESPACE = "XPM";
const INACTIVE_STATUSES = new Set(["stopped", "errored"]);
const DEFAULT_STDIO = { stdin: "ignore", stdout: "pipe", stderr: "ignore" } as const;

export type Pm2AgentProcess = {
  name?: string;
  pm2_env?: { namespace?: string; status?: string };
};

export function readAgentProcesses(): Pm2AgentProcess[] | undefined {
  try {
    const command = process.platform === "win32" ? ["cmd.exe", "/c", "pm2", "jlist"] : ["pm2", "jlist"];
    const result = Bun.spawnSync({ cmd: command, ...DEFAULT_STDIO });
    if (result.exitCode !== 0) return undefined;
    return parsePm2Jlist(result.stdout.toString());
  } catch {
    return undefined;
  }
}

export function parsePm2Jlist(output: string): Pm2AgentProcess[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;

  return parsed.filter((entry): entry is Pm2AgentProcess => typeof entry === "object" && entry !== null);
}

export function isAgentHoldingPort(processes: Pm2AgentProcess[]): boolean {
  return processes.some(
    (process_) =>
      process_.name === AGENT_NAME &&
      process_.pm2_env?.namespace === AGENT_NAMESPACE &&
      !INACTIVE_STATUSES.has(process_.pm2_env?.status ?? ""),
  );
}
