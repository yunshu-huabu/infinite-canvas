import { createApp } from "./app";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";
const app = await createApp();

Bun.serve({
    port,
    hostname,
    fetch: app.fetch,
    idleTimeout: 255,
});

console.log(`Infinite Canvas server listening on http://${hostname}:${port}`);
if (app.initialPassword) {
    console.log("Created the first administrator account:");
    console.log(`  username: ${app.adminUsername}`);
    console.log(`  password: ${app.initialPassword}`);
    console.log("Sign in at /admin and change this password immediately.");
}
