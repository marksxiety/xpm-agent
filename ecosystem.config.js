module.exports = {
  apps: [
    {
      name: "xpm-agent",
      namespace: "XPM",
      cwd: __dirname,
      script: "./dist/index.js",
      interpreter: "bun",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      stop_exit_codes: [2],
      time: true,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};