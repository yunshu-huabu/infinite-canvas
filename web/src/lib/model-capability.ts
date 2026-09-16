const VIDEO_KEYWORDS = ["video", "sora", "veo", "kling", "wan", "hailuo"];
const AUDIO_KEYWORDS = ["audio", "tts", "speech", "voice", "music", "sound"];
const IMAGE_KEYWORDS = ["seedream", "gpt-image", "image", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney"];

/** Best-effort default capability for a freshly fetched model name; users can override it later. */
export function guessCapability(name: string) {
    const value = name.toLowerCase();
    if (VIDEO_KEYWORDS.some((keyword) => value.includes(keyword))) return "video" as const;
    if (AUDIO_KEYWORDS.some((keyword) => value.includes(keyword))) return "audio" as const;
    if (IMAGE_KEYWORDS.some((keyword) => value.includes(keyword))) return "image" as const;
    return "text" as const;
}
