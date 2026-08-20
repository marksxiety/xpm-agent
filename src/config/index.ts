import os from "node:os";
import path from "node:path";

export const config = {
  get SERVER_PORT(): number {
    return Number(process.env.SERVER_PORT ?? 4000);
  },
  get SERVER_TIMEZONE(): string {
    return String(process.env.SERVER_TIMEZONE ?? "Asia/Manila");
  },
  get PM2_HOME(): string {
    return String(process.env.PM2_HOME ?? path.join(os.homedir(), ".pm2"));
  },
};