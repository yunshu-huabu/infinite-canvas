import type { AiConfig, ModelChannel } from "@/stores/use-config-store";

export type AdminChannel = ModelChannel & { hasApiKey?: boolean; clearApiKey?: boolean };
export type AdminConfig = Omit<AiConfig, "channels"> & { channels: AdminChannel[] };
export type AdminUser = { id: number; username: string; createdAt: string; lastLoginAt: string | null };
export type DashboardData = {
    requests24h: number;
    failed24h: number;
    averageMs24h: number;
    configUpdatedAt: string;
    channelCount: number;
    modelCount: number;
    recentRequests: Array<{ channel_id: string; method: string; path: string; status: number; duration_ms: number; created_at: string }>;
};
export type AuditLog = { id: number; username?: string; action: string; target: string; detail: string; ip: string; created_at: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
}

export const adminApi = {
    session: () => request<{ user: AdminUser }>("/api/admin/session"),
    login: (username: string, password: string) => request<{ user: AdminUser }>("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    logout: () => request<{ ok: true }>("/api/admin/logout", { method: "POST" }),
    dashboard: () => request<DashboardData>("/api/admin/dashboard"),
    config: () => request<{ config: AdminConfig }>("/api/admin/config"),
    saveConfig: (config: AdminConfig) => request<{ config: AdminConfig }>("/api/admin/config", { method: "PUT", body: JSON.stringify({ config }) }),
    auditLogs: () => request<{ logs: AuditLog[] }>("/api/admin/audit-logs?limit=100"),
    changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>("/api/admin/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) }),
};
