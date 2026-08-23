module.exports = {
    apps: [{
        name: "x-process-manager-api",
        cwd: __dirname,
        script: "bun",
        args: "src/index.ts",
        interpreter: "none",
        exec_mode: "fork",
        instances: 1,
        autorestart: true,
        max_restarts: 10,
    }],
};