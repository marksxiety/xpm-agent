module.exports = {
  apps: [
    {
      // Core Setup
      name: "xpm-agent",
      namespace: "XPM",            // src/pm2/cli.ts matches name+namespace to detect the live agent
      cwd: __dirname,              // PM2 defaults cwd to the pm2 CLI's dir, not this file's dir
      script: "./dist/index.js",
      interpreter: "bun",
      exec_mode: "fork",           // Bun has no PM2 cluster support; instances defaults to 1

      // Crash Recovery (Indestructible Agent)
      autorestart: true,           // PM2 default; explicit because it is load-bearing here
      stop_exit_codes: [2],        // exit 2 = config/port failure (src/utils/port.ts) → stop, don't retry
      min_uptime: "10s",           // crash sooner than this counts as "unstable"
      max_restarts: 999999,        // effectively unlimited unstable restarts
      exp_backoff_restart_delay: 100, // 100ms, ×1.5 per retry, PM2 caps at 15s

      // Memory Leak Protection
      max_memory_restart: "250M",

      // Logs
      time: true,                  // bakes YYYY-MM-DDTHH:mm:ss: prefix into log lines

      // Environment
      env_production: { NODE_ENV: "production" }, // --env production → Bun loads .env + .env.production
    },
  ],
};
