module.exports = {
    apps: [{
        name: "xpm-agent",
        namespace: 'XPM',
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