module.exports = {
    apps: [{
        name: "api-agent",
        namespace: 'xpm',
        cwd: __dirname,
        script: "bun",
        args: "src/index.ts",
        interpreter: "none",
        exec_mode: "fork",
        instances: 1,
        autorestart: true,
        max_restarts: 10,
        time: true,
    }],
};