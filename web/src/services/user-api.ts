import type { LocalUser } from "@/stores/use-user-store";

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

export const userApi = {
    session: () => request<{ user: LocalUser }>("/api/auth/session"),
    login: (username: string, password: string) => request<{ user: LocalUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>("/api/auth/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) }),
};
