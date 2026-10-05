const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i;

const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

/**
 * Normalizes a PM2 duration (a millisecond number or a string like "10s",
 * "500ms", "2m", "1h", or a bare number string) to milliseconds.
 *
 * PM2's God.js does plain numeric math on `min_uptime`
 * (`min_uptime * max_restarts`, `... < min_uptime`), so a raw string silently
 * disables unstable-restart counting. Every string must be converted before it
 * reaches `pm2.start`. Returns `undefined` for values that are not durations.
 */
export function parseDurationMs(value: string | number): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) return undefined;

  const amount = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();
  return amount * UNIT_TO_MS[unit];
}
