export type UpstreamApiFormat = "openai" | "gemini";

export type UpstreamModelsInput = {
    baseUrl: string;
    apiKey: string;
    apiFormat: UpstreamApiFormat;
};

export async function fetchUpstreamModels(input: UpstreamModelsInput) {
    const endpoint = upstreamModelsUrl(input.baseUrl, input.apiFormat);
    const headers = new Headers({ accept: "application/json" });
    if (input.apiKey) {
        if (input.apiFormat === "gemini") headers.set("x-goog-api-key", input.apiKey);
        else headers.set("authorization", `Bearer ${input.apiKey}`);
    }

    const response = await fetch(endpoint, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
    });
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 5_000_000) throw new Error("上游模型列表响应过大");

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) throw new Error(upstreamErrorMessage(response.status, payload, input.apiKey));

    const models = extractModelNames(payload, input.apiFormat);
    if (!models.length) throw new Error("上游未返回可用模型");
    return models;
}

export function upstreamModelsUrl(baseUrl: string, apiFormat: UpstreamApiFormat) {
    const normalized = normalizeBaseUrl(baseUrl);
    const lower = normalized.toLowerCase();
    if (lower.endsWith("/models")) return normalized;
    if (apiFormat === "gemini") {
        const apiBase = lower.endsWith("/v1") || lower.endsWith("/v1beta") ? normalized : `${normalized}/v1beta`;
        return `${apiBase}/models`;
    }
    const apiBase = lower.endsWith("/v1") ? normalized : `${normalized}/v1`;
    return `${apiBase}/models`;
}

export function normalizeBaseUrl(value: string) {
    const trimmed = value.trim().replace(/\/+$/, "");
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error("Base URL 格式不正确");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Base URL 仅支持 HTTP 或 HTTPS");
    return trimmed;
}

function extractModelNames(payload: unknown, apiFormat: UpstreamApiFormat) {
    if (!payload || typeof payload !== "object") return [];
    const value = payload as { data?: unknown; models?: unknown };
    const entries = apiFormat === "gemini" ? value.models : value.data || value.models;
    if (!Array.isArray(entries)) return [];
    return Array.from(
        new Set(
            entries
                .map((entry) => {
                    if (typeof entry === "string") return entry;
                    if (!entry || typeof entry !== "object") return "";
                    const model = entry as { id?: unknown; name?: unknown };
                    return String(model.id || model.name || "")
                        .replace(/^models\//, "")
                        .trim();
                })
                .filter(Boolean),
        ),
    ).sort((a, b) => a.localeCompare(b));
}

function upstreamErrorMessage(status: number, payload: unknown, apiKey: string) {
    const value = payload && typeof payload === "object" ? (payload as { error?: unknown; message?: unknown }) : {};
    const nested = value.error && typeof value.error === "object" ? (value.error as { message?: unknown }).message : value.error;
    const rawDetail = String(nested || value.message || "");
    const detail = (apiKey ? rawDetail.replaceAll(apiKey, "[已隐藏]") : rawDetail).replace(/\s+/g, " ").trim().slice(0, 240);
    return `上游模型接口请求失败（${status}）${detail ? `：${detail}` : ""}`;
}
