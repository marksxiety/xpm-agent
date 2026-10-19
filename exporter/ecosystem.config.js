module.exports = {
  apps: [
    {
      name: "xpm-exporter",
      namespace: "XPM",
      cwd: __dirname,
      script: "./dist/index.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,

      autorestart: true,
      stop_exit_codes: [2], // missing EXPORTER_* vars or a busy port → stop, don't retry
      min_uptime: "10s",
      max_restarts: 999999,
      exp_backoff_restart_delay: 100,
      max_memory_restart: "200M",

      merge_logs: true,
      time: true,
    },
  ],
};
