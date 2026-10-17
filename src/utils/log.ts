import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { config } from "../config";
import type { LogDirMetrics } from "../types";

export const DEFAULT_TAIL_LINES = 50;
export const MAX_TAIL_LINES = 500;

const LOG_EXTENSION = ".log";

export function tailLines(content: string, tail?: number): string[] {
  const lines = content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const count = Math.min(tail ?? DEFAULT_TAIL_LINES, MAX_TAIL_LINES);
  if (count <= 0) return [];
  return lines.slice(-count);
}

export function pm2LogsDir(): string {
  return path.join(config.PM2_HOME, "logs");
}

export function resolveLogFiles(input: {
  name?: string | undefined;
  namespace?: string | undefined;
}): { output: string; error: string } {
  const namespace = input.namespace ?? "default";
  const base = `${namespace}-${input.name ?? "default"}`;
  return {
    output: path.join(pm2LogsDir(), `${base}-out.log`),
    error: path.join(pm2LogsDir(), `${base}-error.log`),
  };
}

export interface LogMetricsSource {
  logDirMetrics(): Promise<LogDirMetrics>;
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** A PM2 log file, current or rotated (`.log` or gzip-compressed `.log.gz`). */
function isLogFileName(fileName: string): boolean {
  return fileName.endsWith(LOG_EXTENSION) || fileName.endsWith(`${LOG_EXTENSION}.gz`);
}

async function statFileBytes(filePath: string): Promise<number> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() ? fileStat.size : 0;
  } catch (error) {
    if (isEnoent(error)) return 0;
    throw error;
  }
}

/**
 * Sums the bytes of one log stream: the current file plus every rotated sibling.
 *
 * pm2-logrotate renames `foo-out.log` to `foo-out__<date>.log` (`.log.gz` when
 * compression is enabled) and truncates the original, so rotated sibling names
 * share the `<stem>__` prefix while the current file keeps the bare `<stem>.log`
 * name. Missing files contribute zero.
 */
export async function logStreamBytes(logPath: string | undefined): Promise<number> {
  if (!logPath) return 0;
  const dir = path.dirname(logPath);
  const currentName = path.basename(logPath);
  const rotatedPrefix = `${path.basename(logPath, LOG_EXTENSION)}__`;

  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return 0;
    throw error;
  }

  const matches = entries.filter(
    (entry) => entry.isFile() && (entry.name === currentName || entry.name.startsWith(rotatedPrefix)),
  );
  const sizes = await Promise.all(matches.map((entry) => statFileBytes(path.join(dir, entry.name))));
  return sizes.reduce((total, size) => total + size, 0);
}

/**
 * Resolves the rotated siblings of one log file (e.g. `foo-out__2026-01-01_00-00-00.log`
 * and its `.gz` form) by matching the `<stem>__` prefix pm2-logrotate uses. The
 * current file is not included. A missing directory yields an empty list.
 */
export async function resolveRotatedLogFiles(logPath: string): Promise<string[]> {
  const dir = path.dirname(logPath);
  const rotatedPrefix = `${path.basename(logPath, LOG_EXTENSION)}__`;

  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(rotatedPrefix))
    .map((entry) => path.join(dir, entry.name));
}

/**
 * Totals every `.log`/`.log.gz` file in the PM2 logs directory (all namespaces,
 * current and rotated) — the same footprint pm2-logrotate reports as
 * "Global logs size" / "Files count". A missing logs directory is zero, not an error.
 */
export async function logDirMetrics(): Promise<LogDirMetrics> {
  const dir = pm2LogsDir();
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return { totalBytes: 0, fileCount: 0 };
    throw error;
  }

  const logFiles = entries.filter((entry) => entry.isFile() && isLogFileName(entry.name));
  const sizes = await Promise.all(logFiles.map((entry) => statFileBytes(path.join(dir, entry.name))));
  return {
    totalBytes: sizes.reduce((total, size) => total + size, 0),
    fileCount: logFiles.length,
  };
}

export const logMetricsSource: LogMetricsSource = { logDirMetrics };
