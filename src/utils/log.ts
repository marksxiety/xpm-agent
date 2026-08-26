import path from "node:path";
import { config } from "../config";

export const DEFAULT_TAIL_LINES = 50;
export const MAX_TAIL_LINES = 500;

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