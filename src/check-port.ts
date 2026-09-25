import { formatPortError, formatPortInUseError, resolveServerPort, STARTUP_ERROR_EXIT_CODE } from "./utils/port";
import { findListeningPidsOnHost, findProcessName } from "./utils/port-usage";
import { isAgentHoldingPort, readAgentProcesses } from "./pm2/cli";

const resolution = resolveServerPort(process.env.SERVER_PORT);
if (!resolution.ok) {
  console.error(`xpm-agent preflight failed: ${resolution.message}`);
  process.exit(STARTUP_ERROR_EXIT_CODE);
}

const agentProcesses = readAgentProcesses();

if (agentProcesses !== undefined && isAgentHoldingPort(agentProcesses)) {
  console.log("xpm-agent is already running under PM2 — skipping port check (startOrReload will restart it).");
} else {
  if (agentProcesses === undefined) {
    console.warn("xpm-agent preflight: could not query PM2; relying on the runtime port check.");
  }

  const listeningPids = findListeningPidsOnHost(resolution.port);
  if (listeningPids && listeningPids.length > 0) {
    const [pid] = listeningPids;
    const processName = pid === undefined ? undefined : findProcessName(pid);
    console.error(`xpm-agent preflight failed: ${formatPortInUseError(resolution.port, pid, processName)}`);
    process.exit(STARTUP_ERROR_EXIT_CODE);
  }

  if (listeningPids !== undefined) {
    console.log(`Port ${resolution.port} is available.`);
  } else {
    // OS listener table unavailable (non-Windows or command failure): fall back
    // to a bind probe, which at least catches exact-address conflicts.
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
}
