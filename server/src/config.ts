export type ApiFormat = "openai" | "gemini";
export type ModelCapability = "image" | "video" | "text" | "audio";

export type ChannelModel = {
    name: string;
    capability: ModelCapability;
    script?: string;
};

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiFormat;
    models: ChannelModel[];
};

export type ManagedAiConfig = {
    channels: ModelChannel[];
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoMode: string;
    systemPrompt: string;
    reasoningEffort: "auto" | "low" | "medium" | "high" | "xhigh";
    quality: string;
    size: string;
    background: string;
    count: string;
    canvasImageCount: string;
};

const defaultModels: ChannelModel[] = [
    { name: "gpt-image-2", capability: "image" },
    { name: "grok-imagine-video", capability: "video" },
    { name: "gpt-5.5", capability: "text" },
    { name: "gpt-4o-mini-tts", capability: "audio" },
];

export const defaultManagedConfig: ManagedAiConfig = {
    channels: [
        {
            id: "default",
            name: "默认渠道",
            baseUrl: "https://api.openai.com",
            apiKey: "",
            apiFormat: "openai",
            models: defaultModels,
        },
    ],
    imageModel: "default::gpt-image-2",
    videoModel: "default::grok-imagine-video",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoMode: "frames",
    systemPrompt: "",
    reasoningEffort: "auto",
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "3",
};

const capabilities = new Set<ModelCapability>(["image", "video", "text", "audio"]);

export function normalizeManagedConfig(input: unknown, previous: ManagedAiConfig = defaultManagedConfig): ManagedAiConfig {
    const value = input && typeof input === "object" ? (input as Partial<ManagedAiConfig>) : {};
    const channels = Array.isArray(value.channels)
        ? value.channels
              .map((channel, index) =>
                  normalizeChannel(
                      channel,
                      previous.channels.find((item) => item.id === channel?.id),
                      index,
                  ),
              )
              .filter((channel): channel is ModelChannel => Boolean(channel))
        : previous.channels;
    if (!channels.length) throw new Error("至少需要保留一个 AI 渠道");
    const base = { ...defaultManagedConfig, ...previous, ...value, channels };
    const modelOptions = new Set(channels.flatMap((channel) => channel.models.map((model) => `${channel.id}::${model.name}`)));
    return {
        ...base,
        channels,
        imageModel: validModel(base.imageModel, "image", channels, modelOptions),
        videoModel: validModel(base.videoModel, "video", channels, modelOptions),
        textModel: validModel(base.textModel, "text", channels, modelOptions),
        audioModel: validModel(base.audioModel, "audio", channels, modelOptions),
        reasoningEffort: ["auto", "low", "medium", "high", "xhigh"].includes(base.reasoningEffort) ? base.reasoningEffort : "auto",
        videoMode: base.videoMode === "reference" ? "reference" : "frames",
    };
}

function normalizeChannel(input: unknown, previous: ModelChannel | undefined, index: number): ModelChannel | null {
    if (!input || typeof input !== "object") return null;
    const value = input as Partial<ModelChannel> & { hasApiKey?: boolean; clearApiKey?: boolean };
    const id = cleanId(value.id || `channel-${index + 1}`);
    const baseUrl = String(value.baseUrl || previous?.baseUrl || "")
        .trim()
        .replace(/\/+$/, "");
    if (!id || !baseUrl || !/^https?:\/\//i.test(baseUrl)) throw new Error(`渠道 ${value.name || index + 1} 的地址无效`);
    const models = Array.isArray(value.models)
        ? value.models
              .map((model) => {
                  const name = String(model?.name || "").trim();
                  if (!name) return null;
                  const capability = capabilities.has(model?.capability as ModelCapability) ? (model.capability as ModelCapability) : "text";
                  return { name, capability, ...(model.script?.trim() ? { script: model.script.trim() } : {}) };
              })
              .filter((model): model is ChannelModel => Boolean(model))
        : previous?.models || [];
    return {
        id,
        name: String(value.name || previous?.name || `渠道 ${index + 1}`).trim(),
        baseUrl,
        apiKey: value.clearApiKey ? "" : value.apiKey ? String(value.apiKey) : previous?.apiKey || "",
        apiFormat: value.apiFormat === "gemini" ? "gemini" : "openai",
        models,
    };
}

function cleanId(value: string) {
    return value
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .slice(0, 64);
}

function validModel(value: string, capability: ModelCapability, channels: ModelChannel[], options: Set<string>) {
    if (options.has(value)) return value;
    return channels.flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => `${channel.id}::${model.name}`))[0] || "";
}

export function publicConfig(config: ManagedAiConfig) {
    const channels = config.channels.map((channel) => ({
        ...channel,
        baseUrl: `/api/ai/channels/${encodeURIComponent(channel.id)}`,
        apiKey: "server-managed",
    }));
    return {
        ...config,
        channelMode: "remote" as const,
        baseUrl: channels[0]?.baseUrl || "",
        apiKey: "server-managed",
        apiFormat: channels[0]?.apiFormat || "openai",
        channels,
        model: config.imageModel,
        models: channels.flatMap((channel) => channel.models.map((model) => `${channel.id}::${model.name}`)),
        proxyEnabled: false,
        proxyUrl: "",
    };
}

export function adminConfig(config: ManagedAiConfig) {
    return {
        ...config,
        channels: config.channels.map((channel) => ({
            ...channel,
            apiKey: "",
            hasApiKey: Boolean(channel.apiKey),
            clearApiKey: false,
        })),
    };
}
