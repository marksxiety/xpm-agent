import os from "node:os";
import path from "node:path";

const SERVER_PORT: number = Number(process.env.SERVER_PORT ?? 4000);
const SERVER_TIMEZONE: string = String(process.env.SERVER_TIMEZONE ?? "Asia/Manila");
const PM2_HOME: string = String(process.env.PM2_HOME ?? path.join(os.homedir(), ".pm2"));

export const config = {
  SERVER_PORT,
  SERVER_TIMEZONE,
  PM2_HOME,
};