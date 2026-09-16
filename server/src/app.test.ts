import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createApp } from "./app";

let app: Awaited<ReturnType<typeof createApp>>;

beforeEach(async () => {
    app = await createApp({
        databasePath: ":memory:",
        dataDir: `.test-data-${crypto.randomUUID()}`,
        encryptionSecret: "test-secret",
        adminUsername: "admin",
        adminPassword: "correct-horse-battery",
        staticDir: "web/dist",
    });
    app.db.createUser("creator", "创作者", await Bun.password.hash("creator-password", { algorithm: "argon2id" }));
});

afterEach(() => app.db.close());

async function login(password = "correct-horse-battery") {
    const response = await app.fetch(
        new Request("http://localhost/api/admin/login", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                origin: "http://localhost",
            },
            body: JSON.stringify({ username: "admin", password }),
        }),
    );
    return {
        response,
        cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
}

async function loginUser(password = "creator-password") {
    const response = await app.fetch(
        new Request("http://localhost/api/auth/login", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                origin: "http://localhost",
            },
            body: JSON.stringify({ username: "creator", password }),
        }),
    );
    return {
        response,
        cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
}

describe("admin authentication", () => {
    test("creates the initial administrator and logs in", async () => {
        expect(app.initialPassword).toBe("correct-horse-battery");
        const { response, cookie } = await login();
        expect(response.status).toBe(200);
        expect(cookie).toContain("canvas_admin_session=");
        expect(response.headers.get("set-cookie")).not.toContain("Secure");

        const session = await app.fetch(
            new Request("http://localhost/api/admin/session", {
                headers: { cookie },
            }),
        );
        expect(session.status).toBe(200);
        expect((await session.json()).user.username).toBe("admin");
    });

    test("rejects an invalid password", async () => {
        const { response } = await login("wrong-password");
        expect(response.status).toBe(401);
    });

    test("accepts a same-host request forwarded by the development proxy", async () => {
        const response = await app.fetch(
            new Request("http://127.0.0.1:3001/api/admin/login", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    origin: "http://localhost:3000",
                    host: "127.0.0.1:3001",
                    "sec-fetch-site": "same-origin",
                },
                body: JSON.stringify({
                    username: "admin",
                    password: "correct-horse-battery",
                }),
            }),
        );
        expect(response.status).toBe(200);
    });

    test("rejects a cross-site login request", async () => {
        const response = await app.fetch(
            new Request("http://localhost/api/admin/login", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    origin: "https://evil.example",
                    "sec-fetch-site": "cross-site",
                },
                body: JSON.stringify({
                    username: "admin",
                    password: "correct-horse-battery",
                }),
            }),
        );
        expect(response.status).toBe(403);
    });
});

describe("managed configuration", () => {
    test("never exposes provider credentials to the public config", async () => {
        const config = app.db.getConfig();
        config.channels[0].apiKey = "sk-secret";
        app.db.setConfig(config, null);

        const { cookie } = await loginUser();
        const response = await app.fetch(new Request("http://localhost/api/config", { headers: { cookie } }));
        const body = await response.json();
        expect(body.config.channels[0].apiKey).toBe("server-managed");
        expect(body.config.channels[0].baseUrl).toBe("/api/ai/channels/default");
        expect(JSON.stringify(body)).not.toContain("sk-secret");
    });

    test("preserves an existing API key when admin submits a blank value", async () => {
        const stored = app.db.getConfig();
        stored.channels[0].apiKey = "sk-existing";
        app.db.setConfig(stored, null);
        const { cookie } = await login();
        const editable = JSON.parse(JSON.stringify(stored));
        editable.channels[0].apiKey = "";

        const response = await app.fetch(
            new Request("http://localhost/api/admin/config", {
                method: "PUT",
                headers: {
                    cookie,
                    origin: "http://localhost",
                    "content-type": "application/json",
                },
                body: JSON.stringify({ config: editable }),
            }),
        );
        expect(response.status).toBe(200);
        expect(app.db.getConfig().channels[0].apiKey).toBe("sk-existing");
    });

    test("requires authentication to update configuration", async () => {
        const response = await app.fetch(
            new Request("http://localhost/api/admin/config", {
                method: "PUT",
                headers: {
                    origin: "http://localhost",
                    "content-type": "application/json",
                },
                body: JSON.stringify({ config: {} }),
            }),
        );
        expect(response.status).toBe(401);
    });

    test("injects the stored credential when proxying an AI request", async () => {
        const upstream = Bun.serve({
            port: 0,
            fetch(request) {
                return Response.json({
                    authorization: request.headers.get("authorization"),
                    path: new URL(request.url).pathname,
                });
            },
        });
        try {
            const config = app.db.getConfig();
            config.channels[0].baseUrl = `http://127.0.0.1:${upstream.port}`;
            config.channels[0].apiKey = "sk-server-only";
            app.db.setConfig(config, null);
            const { cookie } = await loginUser();
            const response = await app.fetch(
                new Request("http://localhost/api/ai/channels/default/v1/models", {
                    headers: { authorization: "Bearer browser-placeholder", cookie },
                }),
            );
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                authorization: "Bearer sk-server-only",
                path: "/v1/models",
            });
        } finally {
            upstream.stop(true);
        }
    });
});

describe("user authentication", () => {
    test("logs in and exposes the current user session", async () => {
        const { response, cookie } = await loginUser();
        expect(response.status).toBe(200);
        expect(cookie).toContain("canvas_user_session=");
        const session = await app.fetch(new Request("http://localhost/api/auth/session", { headers: { cookie } }));
        expect(session.status).toBe(200);
        expect((await session.json()).user.displayName).toBe("创作者");
    });

    test("protects configuration and AI proxy endpoints", async () => {
        expect((await app.fetch(new Request("http://localhost/api/config"))).status).toBe(401);
        expect((await app.fetch(new Request("http://localhost/api/ai/channels/default/v1/models"))).status).toBe(401);
    });

    test("disabled users cannot keep or create sessions", async () => {
        const { cookie } = await loginUser();
        const user = app.db.findUser("creator")!;
        app.db.updateUser(user.id, user.display_name, true);
        expect(
            (
                await app.fetch(
                    new Request("http://localhost/api/auth/session", {
                        headers: { cookie },
                    }),
                )
            ).status,
        ).toBe(401);
        expect((await loginUser()).response.status).toBe(401);
    });
});

describe("admin user management", () => {
    test("creates and lists a user account", async () => {
        const { cookie } = await login();
        const created = await app.fetch(
            new Request("http://localhost/api/admin/users", {
                method: "POST",
                headers: {
                    cookie,
                    origin: "http://localhost",
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "designer",
                    displayName: "设计师",
                    password: "designer-password",
                }),
            }),
        );
        expect(created.status).toBe(201);
        const users = await app.fetch(new Request("http://localhost/api/admin/users", { headers: { cookie } }));
        expect((await users.json()).users.some((user: { username: string }) => user.username === "designer")).toBe(true);
    });

    test("rejects invalid user account input", async () => {
        const { cookie } = await login();
        const response = await app.fetch(
            new Request("http://localhost/api/admin/users", {
                method: "POST",
                headers: {
                    cookie,
                    origin: "http://localhost",
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "x",
                    displayName: "",
                    password: "short",
                }),
            }),
        );
        expect(response.status).toBe(400);
    });
});
