import { stat } from "node:fs/promises";
import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";
import { resolveStartScriptPath, type TargetOs } from "./inspect";
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
 * absolute and `script` resolves inside it here. Order matters: a missing
 * `cwd` reports `field: "cwd"` and skips the script check; otherwise a
 * missing script reports `field: "script"`.
 *
 * Skipped when `targetOs` differs from the agent host OS — the agent cannot
 * stat a foreign filesystem. Unexpected `fs` errors fail open (return no
 * issues) so PM2 remains the final authority.
 */
export async function verifyStartPaths(
  payload: Pick<StartPayloadType, "cwd" | "script" | "targetOs">,
  overrides: PathCheckOverrides = {},
): Promise<StartIssue[]> {
  const targetOs: TargetOs = payload.targetOs ?? "win32";
  const platform = overrides.platform ?? process.platform;
  if (targetOs !== platform) return [];

  const cwd = payload.cwd;
  const script = payload.script ?? "";
  if (cwd === undefined || cwd.trim() === "" || script.trim() === "") return [];

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

  const resolved = resolveStartScriptPath(cwd, script, targetOs);
  try {
    const scriptStat = await statFn(resolved);
    if (!scriptStat.isFile()) {
      return [{ field: "script", message: `script '${script}' was not found inside cwd '${cwd}'` }];
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      return [{ field: "script", message: `script '${script}' is not accessible by the agent` }];
    }
    if (code === undefined) return [];
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ENAMETOOLONG") {
      return [{ field: "script", message: `script '${script}' was not found inside cwd '${cwd}'` }];
    }
    return [];
  }

  return [];
}
