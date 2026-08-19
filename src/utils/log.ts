import path from "node:path";
import os from "node:os";

export function pm2LogsDir(): string {
  return path.join(process.env.PM2_HOME ?? path.join(os.homedir(), ".pm2"), "logs");
}

export function resolveLogFiles(input: {
  script: string;
  name?: string;
  namespace?: string;
  log_file?: string;
}): { output: string; error: string } {
  const name = input.name ?? path.basename(input.script, path.extname(input.script));
  const namespace = input.namespace ?? "default";
  const base = input.log_file ? path.basename(input.log_file, path.extname(input.log_file)) : `${namespace}-${name}`;
  return {
    output: path.join(pm2LogsDir(), `${base}-out.log`),
    error: path.join(pm2LogsDir(), `${base}-error.log`),
  };
}
