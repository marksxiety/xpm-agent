import { stat } from "node:fs/promises";
import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";
import type { TargetOs } from "./inspect";
import type { StartIssue } from "../types/inspect";

type StartPayloadType = Static<typeof StartPayload>;

export interface PathCheckOverrides {
  /** Defaults to `process.platform`. Injected in tests. */
  platform?: string;
  /** Defaults to `stat` from `node:fs/promises`. Injected in tests. */
  statFn?: typeof stat;
}

/**
 * Filesystem existence phase for `POST /pm2/start`.
 *
 * Runs only after the shape checks in `inspectStart` pass, so `cwd` is
 * absolute here. Verifies `cwd` exists as a directory; the script's resolution
 * and existence are PM2's responsibility (a missing script surfaces as
 * `400 SCRIPT_NOT_FOUND`).
 *
 * Skipped when `targetOs` differs from the agent host OS — the agent cannot
 * stat a foreign filesystem. Unexpected `fs` errors fail open (return no
 * issues) so PM2 remains the final authority.
 */
export async function verifyStartPaths(
  payload: Pick<StartPayloadType, "cwd" | "targetOs">,
  overrides: PathCheckOverrides = {},
): Promise<StartIssue[]> {
  const targetOs: TargetOs = payload.targetOs ?? "win32";
  const platform = overrides.platform ?? process.platform;
  if (targetOs !== platform) return [];

  const cwd = payload.cwd;
  if (cwd === undefined || cwd.trim() === "") return [];

  const statFn = overrides.statFn ?? stat;

  try {
    const cwdStat = await statFn(cwd);
    if (!cwdStat.isDirectory()) {
      return [{ field: "cwd", message: `cwd '${cwd}' does not exist or is not a directory` }];
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      return [{ field: "cwd", message: `cwd '${cwd}' is not accessible by the agent` }];
    }
    if (code === undefined) return [];
    if (code === "ENOENT" || code === "ENOTDIR") {
      return [{ field: "cwd", message: `cwd '${cwd}' does not exist or is not a directory` }];
    }
    return [];
  }

  return [];
}
