import { buildSamples, render, type Pm2ProcessInput } from "./metrics";

// Library-level fallback for callers that omit timeoutMs. The environment
// variable is required, so a PM2-managed run never relies on this.
export const DEFAULT_TIMEOUT_MS = 5000;

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
  now = Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  pm2: Pm2ListAdapter;
  now?: number;
  timeoutMs?: number;
}): Promise<string> {
  const list = await pm2List(pm2, timeoutMs);
  return render(buildSamples(list, now));
}
