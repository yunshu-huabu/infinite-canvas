import type { AiConfig } from "@/stores/use-config-store";

export type BackendConfigResponse = { config: AiConfig };

export async function fetchBackendConfig(fetcher: typeof fetch = fetch) {
    const response = await fetcher("/api/config", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`Backend configuration request failed: ${response.status}`);
    const data = (await response.json()) as BackendConfigResponse;
    if (!data.config || !Array.isArray(data.config.channels)) throw new Error("Backend configuration response is invalid");
    return data.config;
}
