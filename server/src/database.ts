import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { defaultManagedConfig, normalizeManagedConfig, type ManagedAiConfig } from "./config";
import { decryptJson, encryptJson } from "./security";

export type AdminUser = {
    id: number;
    username: string;
    password_hash: string;
    created_at: string;
    updated_at: string;
    last_login_at: string | null;
};
export type UserRole = "admin" | "user";
export type AppUser = {
    id: number;
    username: string;
    display_name: string;
    password_hash: string;
    role: UserRole;
    disabled: number;
    created_at: string;
    updated_at: string;
    last_login_at: string | null;
};

export class AppDatabase {
    readonly sqlite: Database;

    constructor(
        path: string,
        private readonly encryptionKey: Buffer,
    ) {
        if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
        this.sqlite = new Database(path, { create: true, strict: true });
        this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
        this.migrate();
    }

    private migrate() {
        this.sqlite.exec(`
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
                disabled INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            );
            CREATE TABLE IF NOT EXISTS user_sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                updated_by INTEGER REFERENCES admins(id),
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER REFERENCES admins(id),
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '{}',
                actor_username TEXT,
                ip TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS api_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                method TEXT NOT NULL,
                path TEXT NOT NULL,
                status INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
            CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions(expires_at);
            CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS requests_created_idx ON api_requests(created_at DESC);
        `);
        this.ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user'))");
        this.ensureColumn("audit_logs", "actor_username", "TEXT");
        if (!this.sqlite.query("SELECT 1 FROM settings WHERE key = 'ai_config'").get()) this.setConfig(defaultManagedConfig, null);
    }

    private ensureColumn(table: "users" | "audit_logs", column: string, definition: string) {
        const columns = this.sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        if (!columns.some((item) => item.name === column)) this.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }

    close() {
        this.sqlite.close();
    }

    adminCount() {
        return Number(
            (
                this.sqlite.query("SELECT COUNT(*) AS count FROM admins").get() as {
                    count: number;
                }
            ).count,
        );
    }

    createAdmin(username: string, passwordHash: string) {
        const now = new Date().toISOString();
        return this.sqlite.query("INSERT INTO admins (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id, username, created_at, updated_at, last_login_at").get(username, passwordHash, now, now) as Omit<
            AdminUser,
            "password_hash"
        >;
    }

    findAdmin(username: string) {
        return this.sqlite.query("SELECT * FROM admins WHERE username = ?").get(username) as AdminUser | null;
    }

    findAdminById(id: number) {
        return this.sqlite.query("SELECT * FROM admins WHERE id = ?").get(id) as AdminUser | null;
    }

    updatePassword(id: number, passwordHash: string) {
        this.sqlite.query("UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, new Date().toISOString(), id);
        this.sqlite.query("DELETE FROM sessions WHERE admin_id = ?").run(id);
    }

    touchLogin(id: number) {
        this.sqlite.query("UPDATE admins SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    }

    createSession(tokenHash: string, adminId: number, expiresAt: string) {
        const now = new Date().toISOString();
        this.sqlite.query("DELETE FROM sessions WHERE expires_at <= ?").run(now);
        this.sqlite.query("INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(tokenHash, adminId, expiresAt, now);
    }

    sessionAdmin(tokenHash: string) {
        return this.sqlite.query("SELECT admins.* FROM sessions JOIN admins ON admins.id = sessions.admin_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?").get(tokenHash, new Date().toISOString()) as AdminUser | null;
    }

    deleteSession(tokenHash: string) {
        this.sqlite.query("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    }

    userCount() {
        return Number(
            (
                this.sqlite.query("SELECT COUNT(*) AS count FROM users").get() as {
                    count: number;
                }
            ).count,
        );
    }

    createUser(username: string, displayName: string, passwordHash: string, role: UserRole = "user") {
        const now = new Date().toISOString();
        return this.sqlite
            .query("INSERT INTO users (username, display_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, username, display_name, role, disabled, created_at, updated_at, last_login_at")
            .get(username, displayName, passwordHash, role, now, now) as Omit<AppUser, "password_hash">;
    }

    users() {
        return this.sqlite.query("SELECT id, username, display_name, role, disabled, created_at, updated_at, last_login_at FROM users ORDER BY id DESC").all();
    }

    findUser(username: string) {
        return this.sqlite.query("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username) as AppUser | null;
    }

    findUserById(id: number) {
        return this.sqlite.query("SELECT * FROM users WHERE id = ?").get(id) as AppUser | null;
    }

    updateUser(id: number, displayName: string, disabled: boolean, role: UserRole = "user") {
        this.sqlite.query("UPDATE users SET display_name = ?, role = ?, disabled = ?, updated_at = ? WHERE id = ?").run(displayName, role, disabled ? 1 : 0, new Date().toISOString(), id);
        if (disabled) this.sqlite.query("DELETE FROM user_sessions WHERE user_id = ?").run(id);
        return this.findUserById(id);
    }

    updateUserPassword(id: number, passwordHash: string) {
        this.sqlite.query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, new Date().toISOString(), id);
        this.sqlite.query("DELETE FROM user_sessions WHERE user_id = ?").run(id);
    }

    deleteUser(id: number) {
        return this.sqlite.query("DELETE FROM users WHERE id = ?").run(id).changes > 0;
    }

    touchUserLogin(id: number) {
        this.sqlite.query("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    }

    createUserSession(tokenHash: string, userId: number, expiresAt: string) {
        const now = new Date().toISOString();
        this.sqlite.query("DELETE FROM user_sessions WHERE expires_at <= ?").run(now);
        this.sqlite.query("INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(tokenHash, userId, expiresAt, now);
    }

    sessionUser(tokenHash: string) {
        return this.sqlite
            .query("SELECT users.* FROM user_sessions JOIN users ON users.id = user_sessions.user_id WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ? AND users.disabled = 0")
            .get(tokenHash, new Date().toISOString()) as AppUser | null;
    }

    deleteUserSession(tokenHash: string) {
        this.sqlite.query("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash);
    }

    getConfig() {
        const row = this.sqlite.query("SELECT value FROM settings WHERE key = 'ai_config'").get() as { value: string } | null;
        return row ? normalizeManagedConfig(decryptJson<ManagedAiConfig>(row.value, this.encryptionKey)) : defaultManagedConfig;
    }

    setConfig(config: ManagedAiConfig, adminId: number | null) {
        const value = encryptJson(config, this.encryptionKey);
        this.sqlite
            .query("INSERT INTO settings (key, value, encrypted, updated_by, updated_at) VALUES ('ai_config', ?, 1, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
            .run(value, adminId, new Date().toISOString());
    }

    audit(adminId: number | null, action: string, target: string, detail: unknown, ip: string, actorUsername?: string) {
        this.sqlite
            .query("INSERT INTO audit_logs (admin_id, action, target, detail, actor_username, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(adminId, action, target, JSON.stringify(detail || {}), actorUsername || null, ip, new Date().toISOString());
    }

    audits(limit = 100) {
        return this.sqlite
            .query(
                "SELECT audit_logs.id, audit_logs.action, audit_logs.target, audit_logs.detail, audit_logs.ip, audit_logs.created_at, COALESCE(audit_logs.actor_username, admins.username) AS username FROM audit_logs LEFT JOIN admins ON admins.id = audit_logs.admin_id ORDER BY audit_logs.id DESC LIMIT ?",
            )
            .all(Math.max(1, Math.min(200, limit)));
    }

    recordRequest(channelId: string, method: string, path: string, status: number, durationMs: number) {
        this.sqlite.query("INSERT INTO api_requests (channel_id, method, path, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(channelId, method, path.slice(0, 500), status, durationMs, new Date().toISOString());
    }

    dashboard() {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const requests = this.sqlite.query("SELECT COUNT(*) AS total, SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS failed, COALESCE(ROUND(AVG(duration_ms)), 0) AS average_ms FROM api_requests WHERE created_at >= ?").get(since) as {
            total: number;
            failed: number;
            average_ms: number;
        };
        const recent = this.sqlite.query("SELECT channel_id, method, path, status, duration_ms, created_at FROM api_requests ORDER BY id DESC LIMIT 12").all();
        const setting = this.sqlite.query("SELECT updated_at FROM settings WHERE key = 'ai_config'").get() as { updated_at: string };
        return {
            requests24h: requests.total || 0,
            failed24h: requests.failed || 0,
            averageMs24h: requests.average_ms || 0,
            configUpdatedAt: setting.updated_at,
            recentRequests: recent,
        };
    }
}
