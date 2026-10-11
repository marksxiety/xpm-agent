import os from "node:os";
import path from "node:path";
import { parseFlagRules } from "../utils/inspect";
import type { FlagRule } from "../types/inspect";

let interpreterFlagsCache: Record<string, FlagRule[]> | undefined;

export const config = {
  get PM2_HOME(): string {
    return String(process.env.PM2_HOME ?? path.join(os.homedir(), ".pm2"));
  },
  get CORS_ORIGIN(): string[] {
    const raw = process.env.CORS_ORIGIN;
    if (!raw) return [];
    return raw.split(",").map((origin) => origin.trim()).filter(Boolean);
  },
  get AUTH_TOKEN(): string {
    return String(process.env.AUTH_TOKEN ?? "");
  },
  /** Optional comma-separated allowlist of absolute app roots for `cwd`. */
  get APP_ROOTS(): string[] {
    const raw = process.env.APP_ROOTS;
    if (!raw) return [];
    return raw.split(",").map((root) => root.trim()).filter(Boolean);
  },
  /** Optional comma-separated allowlist of absolute directories an interpreter executable must live under. */
  get INTERPRETER_ROOTS(): string[] {
    const raw = process.env.INTERPRETER_ROOTS;
    if (!raw) return [];
    return raw.split(",").map((root) => root.trim()).filter(Boolean);
  },
  /**
   * Allowed interpreter flags per executable base name, as JSON. Example:
   * {"node":[{"kind":"pattern","pattern":"^--max-old-space-size=\\d+$"},{"kind":"path","flag":"--env-file"}],
   *  "python":[{"kind":"exact","flag":"-u"},{"kind":"exact","flag":"-B"}]}
   * Parsed lazily and memoized; a malformed value throws so startup can fail fast (see validateConfig).
   */
  get INTERPRETER_FLAGS(): Record<string, FlagRule[]> {
    if (interpreterFlagsCache !== undefined) return interpreterFlagsCache;
    const raw = process.env.INTERPRETER_FLAGS;
    if (!raw) return {};
    interpreterFlagsCache = parseFlagRules(JSON.parse(raw));
    return interpreterFlagsCache;
  },
};

/**
 * Forces the lazy config getters to evaluate so a malformed value (e.g. bad
 * INTERPRETER_FLAGS JSON or an invalid rule regex) fails at startup rather than
 * on the first request that happens to read it.
 */
export function validateConfig(): void {
  void config.INTERPRETER_FLAGS;
}