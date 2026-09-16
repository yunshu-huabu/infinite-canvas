const api = Bun.spawn(["bun", "--watch", "server/src/index.ts"], {
    cwd: import.meta.dir + "/..",
    env: { ...process.env, PORT: "3001", HOST: "127.0.0.1", STATIC_DIR: "web/dist" },
    stdout: "inherit",
    stderr: "inherit",
});

const web = Bun.spawn(["bun", "run", "--cwd", "web", "dev"], {
    cwd: import.meta.dir + "/..",
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
});

const stop = () => {
    api.kill();
    web.kill();
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await Promise.race([api.exited, web.exited]);
stop();
