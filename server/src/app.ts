import { existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

import { adminConfig, normalizeManagedConfig, publicConfig } from "./config";
import { AppDatabase, type AdminUser, type AppUser, type UserRole } from "./database";
import { hashToken, loadEncryptionKey, randomToken } from "./security";
import { fetchUpstreamModels, normalizeBaseUrl, type UpstreamApiFormat } from "./upstream-models";

const SESSION_COOKIE = "canvas_admin_session";
const USER_SESSION_COOKIE = "canvas_user_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

type AdminAuth = { kind: "system"; principal: AdminUser; adminId: number; tokenHash: string } | { kind: "user"; principal: AppUser; adminId: null; tokenHash: string };

export type AppOptions = {
    dataDir?: string;
    databasePath?: string;
    staticDir?: string;
    encryptionSecret?: string;
    adminUsername?: string;
    adminPassword?: string;
    production?: boolean;
};

export async function createApp(options: AppOptions = {}) {
    const dataDir = resolve(options.dataDir || process.env.DATA_DIR || "data");
    const databasePath = options.databasePath || join(dataDir, "infinite-canvas.sqlite");
    const encryptionKey = loadEncryptionKey(join(dataDir, "master.key"), options.encryptionSecret || process.env.CONFIG_ENCRYPTION_KEY);
    const db = new AppDatabase(databasePath, encryptionKey);
    const adminUsername = options.adminUsername || process.env.ADMIN_USERNAME || "admin";
    let initialPassword = "";

    if (db.adminCount() === 0) {
        initialPassword = options.adminPassword || process.env.ADMIN_PASSWORD || randomToken(15);
        db.createAdmin(adminUsername, await Bun.password.hash(initialPassword, { algorithm: "argon2id" }));
        db.audit(null, "admin.bootstrap", "admin", { username: adminUsername }, "local");
    }

    const staticDir = resolve(options.staticDir || process.env.STATIC_DIR || "web/dist");
    const fetch = async (request: Request) => {
        const url = new URL(request.url);
        try {
            if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true, version: "0.1.0" });
            if (url.pathname.startsWith("/api/auth/")) return handleUserAuth(request, url, db);
            if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, url, db);
            const userAuth = authenticateUser(request, db);
            if (url.pathname === "/api/config" && request.method === "GET")
                return userAuth
                    ? json({ config: publicConfig(db.getConfig()) }, 200, {
                          "cache-control": "no-store",
                      })
                    : json({ error: "需要用户登录" }, 401);
            if (url.pathname.startsWith("/api/ai/channels/")) return userAuth ? handleAiProxy(request, url, db) : json({ error: "需要用户登录" }, 401);
            if (url.pathname.startsWith("/api/")) return json({ error: "接口不存在" }, 404);
            if (url.pathname === "/config.js") return runtimeConfig();
            return serveStatic(url.pathname, staticDir);
        } catch (error) {
            console.error(error);
            return json({ error: error instanceof Error ? error.message : "服务器内部错误" }, 500);
        }
    };

    return { fetch, db, initialPassword, adminUsername };
}

async function handleAdmin(request: Request, url: URL, db: AppDatabase) {
    const ip = clientIp(request);
    if (request.method !== "GET" && !validOrigin(request, url)) return json({ error: "请求来源校验失败" }, 403);

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
        const rate = loginAttempts.get(ip);
        if (rate && rate.resetAt > Date.now() && rate.count >= 8) return json({ error: "登录尝试过多，请稍后再试" }, 429);
        const body = await readJson<{ username?: string; password?: string }>(request);
        const username = String(body.username || "").trim();
        const admin = username ? db.findAdmin(username) : null;
        const managedUser = username ? db.findUser(username) : null;
        const adminValid = Boolean(admin && body.password && (await Bun.password.verify(body.password, admin.password_hash)));
        const managedUserValid = Boolean(managedUser?.role === "admin" && !managedUser.disabled && body.password && (await Bun.password.verify(body.password, managedUser.password_hash)));
        if (!adminValid && !managedUserValid) {
            recordFailedLogin(ip);
            db.audit(admin?.id || null, "admin.login_failed", "session", { username }, ip, managedUser?.username);
            return json({ error: "用户名或密码错误" }, 401);
        }
        loginAttempts.delete(ip);
        const token = randomToken();
        if (adminValid && admin) {
            const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
            db.createSession(hashToken(token), admin.id, expiresAt.toISOString());
            db.touchLogin(admin.id);
            db.audit(admin.id, "admin.login", "session", {}, ip);
            return json({ user: safeSystemAdmin(admin) }, 200, {
                "set-cookie": sessionCookie(token, expiresAt, secureRequest(request)),
            });
        }
        const expiresAt = new Date(Date.now() + USER_SESSION_TTL_MS);
        db.createUserSession(hashToken(token), managedUser!.id, expiresAt.toISOString());
        db.touchUserLogin(managedUser!.id);
        db.audit(null, "admin.login", "session", { source: "managed_user" }, ip, managedUser!.username);
        return json({ user: safeManagedAdmin(managedUser!) }, 200, {
            "set-cookie": userSessionCookie(token, expiresAt, secureRequest(request)),
        });
    }

    const auth = authenticateAdmin(request, db);
    if (!auth) return json({ error: "需要管理员登录" }, 401);

    if (url.pathname === "/api/admin/session" && request.method === "GET") return json({ user: safeAdminAuth(auth) });
    if (url.pathname === "/api/admin/logout" && request.method === "POST") {
        if (auth.kind === "system") db.deleteSession(auth.tokenHash);
        else db.deleteUserSession(auth.tokenHash);
        auditAsAdmin(db, auth, "admin.logout", "session", {}, ip);
        return json({ ok: true }, 200, {
            "set-cookie": auth.kind === "system" ? clearSessionCookie(secureRequest(request)) : clearUserSessionCookie(secureRequest(request)),
        });
    }
    if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
        const config = db.getConfig();
        return json({
            ...db.dashboard(),
            userCount: db.userCount(),
            channelCount: config.channels.length,
            modelCount: config.channels.reduce((sum, channel) => sum + channel.models.length, 0),
        });
    }
    if (url.pathname === "/api/admin/config" && request.method === "GET")
        return json({ config: adminConfig(db.getConfig()) }, 200, {
            "cache-control": "no-store",
        });
    if (url.pathname === "/api/admin/config" && request.method === "PUT") {
        const body = await readJson<{ config?: unknown }>(request);
        const previous = db.getConfig();
        const config = normalizeManagedConfig(body.config, previous);
        assertUniqueChannels(config.channels.map((channel) => channel.id));
        db.setConfig(config, auth.adminId);
        auditAsAdmin(db, auth, "config.update", "ai_config", summarizeConfig(previous, config), ip);
        return json({ config: adminConfig(config) });
    }
    if (url.pathname === "/api/admin/channels/models" && request.method === "POST") {
        const body = await readJson<{
            channelId?: string;
            baseUrl?: string;
            apiKey?: string;
            apiFormat?: UpstreamApiFormat;
            useStoredApiKey?: boolean;
        }>(request);
        const channelId = String(body.channelId || "").trim();
        const apiFormat: UpstreamApiFormat = body.apiFormat === "gemini" ? "gemini" : "openai";
        let baseUrl: string;
        try {
            baseUrl = normalizeBaseUrl(String(body.baseUrl || ""));
        } catch (error) {
            return json({ error: error instanceof Error ? error.message : "Base URL 格式不正确" }, 400);
        }

        let apiKey = String(body.apiKey || "").trim();
        if (!apiKey && body.useStoredApiKey) {
            const stored = db.getConfig().channels.find((channel) => channel.id === channelId);
            if (!stored) return json({ error: "未找到已保存的渠道，请先保存配置或输入 API Key" }, 400);
            if (normalizeBaseUrl(stored.baseUrl) !== baseUrl || stored.apiFormat !== apiFormat) return json({ error: "渠道地址或协议已修改，请先保存配置或重新输入 API Key" }, 400);
            apiKey = stored.apiKey;
        }

        try {
            const models = await fetchUpstreamModels({ baseUrl, apiKey, apiFormat });
            auditAsAdmin(db, auth, "channel.models_fetch", `channel:${channelId || "unsaved"}`, { count: models.length, apiFormat }, ip);
            return json({ models });
        } catch (error) {
            return json({ error: error instanceof Error ? error.message : "获取上游模型失败" }, 502);
        }
    }
    if (url.pathname === "/api/admin/password" && request.method === "PUT") {
        const body = await readJson<{
            currentPassword?: string;
            newPassword?: string;
        }>(request);
        if (!body.currentPassword || !(await Bun.password.verify(body.currentPassword, auth.principal.password_hash))) return json({ error: "当前密码不正确" }, 400);
        if (!body.newPassword || body.newPassword.length < 12) return json({ error: "新密码至少需要 12 个字符" }, 400);
        const passwordHash = await Bun.password.hash(body.newPassword, { algorithm: "argon2id" });
        if (auth.kind === "system") db.updatePassword(auth.principal.id, passwordHash);
        else db.updateUserPassword(auth.principal.id, passwordHash);
        auditAsAdmin(db, auth, "admin.password_change", "admin", {}, ip);
        return json({ ok: true }, 200, {
            "set-cookie": auth.kind === "system" ? clearSessionCookie(secureRequest(request)) : clearUserSessionCookie(secureRequest(request)),
        });
    }
    if (url.pathname === "/api/admin/audit-logs" && request.method === "GET")
        return json({
            logs: db.audits(Number(url.searchParams.get("limit")) || 100),
        });
    if (url.pathname === "/api/admin/users" && request.method === "GET") return json({ users: db.users().map(safeUser) });
    if (url.pathname === "/api/admin/users" && request.method === "POST") {
        const body = await readJson<{
            username?: string;
            displayName?: string;
            password?: string;
            role?: UserRole;
        }>(request);
        let username: string;
        let role: UserRole;
        try {
            username = normalizeUsername(body.username);
            validateUserPassword(body.password);
            role = normalizeUserRole(body.role);
        } catch (error) {
            return json({ error: error instanceof Error ? error.message : "用户信息不正确" }, 400);
        }
        const displayName = String(body.displayName || username)
            .trim()
            .slice(0, 64);
        if (!displayName) return json({ error: "显示名称不能为空" }, 400);
        try {
            const user = db.createUser(username, displayName, await Bun.password.hash(body.password!, { algorithm: "argon2id" }), role);
            auditAsAdmin(db, auth, "user.create", `user:${user.id}`, { username, role }, ip);
            return json({ user: safeUser(user as AppUser) }, 201);
        } catch (error) {
            if (String(error).toLowerCase().includes("unique")) return json({ error: "用户名已存在" }, 409);
            throw error;
        }
    }
    const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)(?:\/(password))?$/);
    if (userMatch) {
        const userId = Number(userMatch[1]);
        const target = db.findUserById(userId);
        if (!target) return json({ error: "用户不存在" }, 404);
        const isCurrentManagedAdmin = auth.kind === "user" && auth.principal.id === userId;
        if (userMatch[2] === "password" && request.method === "PUT") {
            if (isCurrentManagedAdmin) return json({ error: "请在账号安全中修改自己的密码" }, 400);
            const body = await readJson<{ password?: string }>(request);
            try {
                validateUserPassword(body.password);
            } catch (error) {
                return json({ error: error instanceof Error ? error.message : "密码不符合要求" }, 400);
            }
            db.updateUserPassword(userId, await Bun.password.hash(body.password!, { algorithm: "argon2id" }));
            auditAsAdmin(db, auth, "user.password_reset", `user:${userId}`, { username: target.username }, ip);
            return json({ ok: true });
        }
        if (!userMatch[2] && request.method === "PUT") {
            const body = await readJson<{ displayName?: string; disabled?: boolean; role?: UserRole }>(request);
            const displayName = String(body.displayName || target.display_name)
                .trim()
                .slice(0, 64);
            if (!displayName) return json({ error: "显示名称不能为空" }, 400);
            let role: UserRole;
            try {
                role = normalizeUserRole(body.role, target.role);
            } catch (error) {
                return json({ error: error instanceof Error ? error.message : "用户角色不正确" }, 400);
            }
            if (isCurrentManagedAdmin && (Boolean(body.disabled) || role !== "admin")) return json({ error: "不能停用当前账号或移除自己的管理员角色" }, 400);
            const user = db.updateUser(userId, displayName, Boolean(body.disabled), role);
            auditAsAdmin(db, auth, body.disabled ? "user.disable" : "user.update", `user:${userId}`, { username: target.username, role }, ip);
            return json({ user: safeUser(user!) });
        }
        if (!userMatch[2] && request.method === "DELETE") {
            if (isCurrentManagedAdmin) return json({ error: "不能删除当前登录账号" }, 400);
            db.deleteUser(userId);
            auditAsAdmin(db, auth, "user.delete", `user:${userId}`, { username: target.username }, ip);
            return json({ ok: true });
        }
    }
    return json({ error: "管理接口不存在" }, 404);
}

async function handleUserAuth(request: Request, url: URL, db: AppDatabase) {
    const ip = clientIp(request);
    if (request.method !== "GET" && !validOrigin(request, url)) return json({ error: "请求来源校验失败" }, 403);

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const attemptKey = `user:${ip}`;
        const rate = loginAttempts.get(attemptKey);
        if (rate && rate.resetAt > Date.now() && rate.count >= 10) return json({ error: "登录尝试过多，请稍后再试" }, 429);
        const body = await readJson<{ username?: string; password?: string }>(request);
        const user = body.username ? db.findUser(body.username.trim()) : null;
        const valid = Boolean(user && !user.disabled && body.password && (await Bun.password.verify(body.password, user.password_hash)));
        if (!valid || !user) {
            recordFailedLogin(attemptKey);
            db.audit(null, "user.login_failed", "user_session", { username: body.username || "" }, ip);
            return json({ error: user?.disabled ? "账号已被停用" : "用户名或密码错误" }, 401);
        }
        loginAttempts.delete(attemptKey);
        const token = randomToken();
        const expiresAt = new Date(Date.now() + USER_SESSION_TTL_MS);
        db.createUserSession(hashToken(token), user.id, expiresAt.toISOString());
        db.touchUserLogin(user.id);
        db.audit(null, "user.login", `user:${user.id}`, { username: user.username }, ip);
        return json({ user: safeUser(user) }, 200, {
            "set-cookie": userSessionCookie(token, expiresAt, secureRequest(request)),
        });
    }

    const auth = authenticateUser(request, db);
    if (!auth) return json({ error: "需要用户登录" }, 401);
    if (url.pathname === "/api/auth/session" && request.method === "GET") return json({ user: safeUser(auth.user) });
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        db.deleteUserSession(auth.tokenHash);
        db.audit(null, "user.logout", `user:${auth.user.id}`, { username: auth.user.username }, ip);
        return json({ ok: true }, 200, {
            "set-cookie": clearUserSessionCookie(secureRequest(request)),
        });
    }
    if (url.pathname === "/api/auth/password" && request.method === "PUT") {
        const body = await readJson<{
            currentPassword?: string;
            newPassword?: string;
        }>(request);
        if (!body.currentPassword || !(await Bun.password.verify(body.currentPassword, auth.user.password_hash))) return json({ error: "当前密码不正确" }, 400);
        try {
            validateUserPassword(body.newPassword);
        } catch (error) {
            return json({ error: error instanceof Error ? error.message : "密码不符合要求" }, 400);
        }
        db.updateUserPassword(auth.user.id, await Bun.password.hash(body.newPassword!, { algorithm: "argon2id" }));
        db.audit(null, "user.password_change", `user:${auth.user.id}`, { username: auth.user.username }, ip);
        return json({ ok: true }, 200, {
            "set-cookie": clearUserSessionCookie(secureRequest(request)),
        });
    }
    return json({ error: "用户接口不存在" }, 404);
}

async function handleAiProxy(request: Request, url: URL, db: AppDatabase) {
    const match = url.pathname.match(/^\/api\/ai\/channels\/([^/]+)(\/.*)?$/);
    const channelId = decodeURIComponent(match?.[1] || "");
    const path = match?.[2] || "/";
    const channel = db.getConfig().channels.find((item) => item.id === channelId);
    if (!channel) return json({ error: "AI 渠道不存在" }, 404);
    if (!channel.apiKey) return json({ error: `渠道“${channel.name}”尚未配置 API Key` }, 503);

    const target = joinUpstreamUrl(channel.baseUrl, path, url.search);
    const headers = new Headers(request.headers);
    for (const name of ["host", "content-length", "cookie", "origin", "referer", "x-forwarded-for", "x-real-ip"]) headers.delete(name);
    if (channel.apiFormat === "gemini") {
        headers.delete("authorization");
        headers.set("x-goog-api-key", channel.apiKey);
    } else {
        headers.delete("x-goog-api-key");
        headers.set("authorization", `Bearer ${channel.apiKey}`);
    }

    const startedAt = Date.now();
    let status = 502;
    try {
        const upstream = await fetch(target, {
            method: request.method,
            headers,
            body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
            redirect: "follow",
            signal: request.signal,
        });
        status = upstream.status;
        const responseHeaders = new Headers(upstream.headers);
        for (const name of ["content-encoding", "content-length", "transfer-encoding", "set-cookie", "access-control-allow-origin"]) responseHeaders.delete(name);
        responseHeaders.set("x-canvas-channel", channel.id);
        return new Response(upstream.body, {
            status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "AI 上游请求失败" }, 502);
    } finally {
        db.recordRequest(channel.id, request.method, path, status, Date.now() - startedAt);
    }
}

function authenticateAdmin(request: Request, db: AppDatabase): AdminAuth | null {
    const cookies = parseCookies(request.headers.get("cookie") || "");
    const adminToken = cookies[SESSION_COOKIE];
    if (adminToken) {
        const tokenHash = hashToken(adminToken);
        const admin = db.sessionAdmin(tokenHash);
        if (admin) return { kind: "system", principal: admin, adminId: admin.id, tokenHash };
    }
    const userToken = cookies[USER_SESSION_COOKIE];
    if (!userToken) return null;
    const tokenHash = hashToken(userToken);
    const user = db.sessionUser(tokenHash);
    return user?.role === "admin" ? { kind: "user", principal: user, adminId: null, tokenHash } : null;
}

function authenticateUser(request: Request, db: AppDatabase) {
    const token = parseCookies(request.headers.get("cookie") || "")[USER_SESSION_COOKIE];
    if (!token) return null;
    const tokenHash = hashToken(token);
    const user = db.sessionUser(tokenHash);
    return user ? { user, tokenHash } : null;
}

function safeSystemAdmin(admin: AdminUser) {
    return {
        id: admin.id,
        username: admin.username,
        displayName: admin.username,
        role: "admin" as const,
        source: "system" as const,
        managedUserId: null,
        createdAt: admin.created_at,
        lastLoginAt: admin.last_login_at,
    };
}

function safeManagedAdmin(user: AppUser) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: "admin" as const,
        source: "user" as const,
        managedUserId: user.id,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
    };
}

function safeAdminAuth(auth: AdminAuth) {
    return auth.kind === "system" ? safeSystemAdmin(auth.principal) : safeManagedAdmin(auth.principal);
}

function safeUser(user: AppUser | Omit<AppUser, "password_hash">) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        disabled: Boolean(user.disabled),
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        lastLoginAt: user.last_login_at,
    };
}

function sessionCookie(token: string, expiresAt: Date, secure: boolean) {
    return `${SESSION_COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(secure: boolean) {
    return `${SESSION_COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

function userSessionCookie(token: string, expiresAt: Date, secure: boolean) {
    return `${USER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`;
}

function clearUserSessionCookie(secure: boolean) {
    return `${USER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

function secureRequest(request: Request) {
    return request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" || new URL(request.url).protocol === "https:";
}

function parseCookies(value: string) {
    return Object.fromEntries(
        value
            .split(";")
            .map((part) => part.trim().split("="))
            .filter(([key]) => key)
            .map(([key, ...rest]) => [key, decodeURIComponent(rest.join("="))]),
    );
}

async function readJson<T>(request: Request): Promise<T> {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 2_000_000) throw new Error("请求内容过大");
    return (await request.json()) as T;
}

function validOrigin(request: Request, url: URL) {
    const origin = request.headers.get("origin");
    if (!origin) return true;
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite === "same-origin" || fetchSite === "none") return true;
    if (fetchSite === "cross-site") return false;
    try {
        const originUrl = new URL(origin);
        const expectedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
        return originUrl.host === expectedHost;
    } catch {
        return false;
    }
}

function clientIp(request: Request) {
    return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "local").split(",")[0].trim();
}

function recordFailedLogin(ip: string) {
    const current = loginAttempts.get(ip);
    loginAttempts.set(ip, current && current.resetAt > Date.now() ? { ...current, count: current.count + 1 } : { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
}

function normalizeUsername(value: unknown) {
    const username = String(value || "").trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new Error("用户名需为 3-32 位字母、数字、点、下划线或短横线");
    return username;
}

function validateUserPassword(value: unknown) {
    if (typeof value !== "string" || value.length < 8) throw new Error("用户密码至少需要 8 个字符");
}

function normalizeUserRole(value: unknown, fallback: UserRole = "user"): UserRole {
    if (value === undefined || value === null || value === "") return fallback;
    if (value === "admin" || value === "user") return value;
    throw new Error("用户角色必须是管理员或普通用户");
}

function auditAsAdmin(db: AppDatabase, auth: AdminAuth, action: string, target: string, detail: unknown, ip: string) {
    db.audit(auth.adminId, action, target, detail, ip, auth.kind === "user" ? auth.principal.username : undefined);
}

function assertUniqueChannels(ids: string[]) {
    if (new Set(ids).size !== ids.length) throw new Error("渠道 ID 不能重复");
}

function summarizeConfig(previous: ReturnType<AppDatabase["getConfig"]>, next: ReturnType<AppDatabase["getConfig"]>) {
    return {
        channelsBefore: previous.channels.length,
        channelsAfter: next.channels.length,
        modelsBefore: previous.channels.reduce((sum, channel) => sum + channel.models.length, 0),
        modelsAfter: next.channels.reduce((sum, channel) => sum + channel.models.length, 0),
    };
}

function joinUpstreamUrl(baseUrl: string, path: string, search: string) {
    const base = baseUrl.replace(/\/+$/, "");
    const normalizedPath = base.toLowerCase().endsWith("/v1") && path.toLowerCase().startsWith("/v1/") ? path.slice(3) : path;
    return `${base}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}${search}`;
}

function runtimeConfig() {
    const clean = (value: string | undefined) => (value || "").replace(/[^A-Za-z0-9-]/g, "");
    const script = `window.__RUNTIME_CONFIG__ = ${JSON.stringify({ ANALYTICS_GA4_ID: clean(process.env.ANALYTICS_GA4_ID), ANALYTICS_BAIDU_ID: clean(process.env.ANALYTICS_BAIDU_ID) })};`;
    return new Response(script, {
        headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}

function serveStatic(pathname: string, staticDir: string) {
    if (!existsSync(staticDir)) return json({ error: "前端尚未构建，请先运行 bun run build" }, 503);
    const decoded = decodeURIComponent(pathname);
    const relative = normalize(decoded).replace(/^([/\\])+/, "");
    const candidate = resolve(staticDir, relative || "index.html");
    const insideStaticDir = candidate === staticDir || candidate.startsWith(`${staticDir}${sep}`);
    const filePath = insideStaticDir && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(staticDir, "index.html");
    const headers: Record<string, string> = {
        "content-type": mimeType(filePath),
    };
    if (filePath.endsWith("index.html")) headers["cache-control"] = "no-cache";
    else if (/\.[a-f0-9]{8,}\./i.test(filePath)) headers["cache-control"] = "public, max-age=31536000, immutable";
    return new Response(Bun.file(filePath), { headers });
}

function mimeType(path: string) {
    return (
        {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".woff2": "font/woff2",
            ".mp4": "video/mp4",
        }[extname(path).toLowerCase()] || "application/octet-stream"
    );
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
    return Response.json(value, {
        status,
        headers: { "cache-control": "no-store", ...headers },
    });
}
