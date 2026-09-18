import pm2 from "pm2";
import { formatPortError, resolveServerPort, STARTUP_ERROR_EXIT_CODE } from "./utils/port";

const AGENT_NAME = "xpm-agent";
const AGENT_NAMESPACE = "XPM";
const INACTIVE_STATUSES = new Set(["stopped", "errored"]);

type Pm2AgentProcess = {
  name?: string;
  pm2_env?: { namespace?: string; status?: string };
};

function listPm2Processes(): Promise<Pm2AgentProcess[]> {
  return new Promise((resolve, reject) => {
    pm2.connect((connectionError) => {
      if (connectionError) {
        reject(connectionError);
        return;
      }
      pm2.list((listError, processes) => {
        pm2.disconnect();
        if (listError) {
          reject(listError);
          return;
        }
        resolve(processes ?? []);
      });
    });
  });
}

function isAgentHoldingPort(processes: Pm2AgentProcess[]): boolean {
  return processes.some(
    (process_) =>
      process_.name === AGENT_NAME &&
      process_.pm2_env?.namespace === AGENT_NAMESPACE &&
      !INACTIVE_STATUSES.has(process_.pm2_env?.status ?? ""),
  );
}

const resolution = resolveServerPort(process.env.SERVER_PORT);
if (!resolution.ok) {
  console.error(`xpm-agent preflight failed: ${resolution.message}`);
  process.exit(STARTUP_ERROR_EXIT_CODE);
}

let agentRunning = false;
try {
  agentRunning = isAgentHoldingPort(await listPm2Processes());
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`xpm-agent preflight: could not query PM2 (${detail}); relying on the runtime port check.`);
}

if (agentRunning) {
  console.log("xpm-agent is already running under PM2 — skipping port check (startOrReload will restart it).");
} else {
  try {
    const probe = Bun.serve({
      port: resolution.port,
      reusePort: false,
      fetch: () => new Response(null, { status: 204 }),
    });
    probe.stop(true);
    console.log(`Port ${resolution.port} is available.`);
  } catch (error) {
    console.error(`xpm-agent preflight failed: ${formatPortError(resolution.port, error)}`);
    process.exit(STARTUP_ERROR_EXIT_CODE);
  }
}
