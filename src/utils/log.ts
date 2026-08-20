import path from "node:path";
import { config } from "../config";

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