import { buildHostSamples, buildSamples, isHiddenPm2Process, render, type Pm2ProcessInput } from "./metrics";
import { getHostMetrics, systemInformationSource, type HostMetricsSource } from "./host";

// Library-level fallback for callers that omit timeoutMs. The environment
// variable is required, so a PM2-managed run never relies on this.
export const DEFAULT_TIMEOUT_MS = 5000;

type Logger = { error(message: string): void };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type Pm2ListAdapter = {
  list(
    callback: (error: Error | null, list?: readonly Pm2ProcessInput[]) => void,
  ): void;
};

// Callback-style pm2.list -> Promise, bounded by a timeout. When the PM2
// daemon is gone, pm2.list may never call back at all, so without this the
// scrape request would hang forever instead of reporting a clean 503.
export function pm2List(
  pm2: Pm2ListAdapter,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<readonly Pm2ProcessInput[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`PM2 daemon did not respond within ${timeoutMs}ms`));
    }, timeoutMs);

    pm2.list((error, list) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) return reject(error);
      return resolve(list || []);
    });
  });
}

export async function collect({
  pm2,
  host = systemInformationSource,
  now = Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  log = console,
}: {
  pm2: Pm2ListAdapter;
  host?: HostMetricsSource;
  now?: number;
  timeoutMs?: number;
  log?: Logger;
}): Promise<string> {
  const [listResult, hostResult] = await Promise.allSettled([
    pm2List(pm2, timeoutMs),
    getHostMetrics(host),
  ]);

  if (listResult.status === "rejected") throw listResult.reason;

  const list = listResult.value.filter((process) => !isHiddenPm2Process(process));
  const samples = buildSamples(list, now);

  if (hostResult.status === "fulfilled") {
    samples.push(...buildHostSamples(hostResult.value));
  } else {
    log.error(`[xpm-exporter] host metrics unavailable: ${errorMessage(hostResult.reason)}`);
  }

  return render(samples);
}
