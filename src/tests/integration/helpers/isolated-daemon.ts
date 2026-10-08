import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

interface DaemonOptions {
  rpc_socket_file?: string;
  pub_socket_file?: string;
  pid_file?: string;
}

interface DaemonInstance {
  start(): void;
}

type DaemonConstructor = new (options: DaemonOptions) => DaemonInstance;

// Run the PM2 daemon directly with explicit socket paths. On Windows, pm2's
// paths.js hardcodes \\.\pipe\rpc.sock after applying env overrides, so the
// constructor opts are the only way to keep an isolated daemon off the
// machine-wide pipes.
const Daemon = require("pm2/lib/Daemon.js") as DaemonConstructor;

new Daemon({
  rpc_socket_file: process.env.PM2_DAEMON_RPC_PORT,
  pub_socket_file: process.env.PM2_DAEMON_PUB_PORT,
  pid_file: path.join(process.env.PM2_HOME ?? "", "pm2.pid"),
}).start();
