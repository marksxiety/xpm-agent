import os from "node:os";
import path from "node:path";

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
};