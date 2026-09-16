import { describe, expect, test } from "bun:test";

import { mergeUpstreamModels } from "./channel-models";

describe("mergeUpstreamModels", () => {
    test("preserves configured models and classifies newly fetched models", () => {
        const existing = [{ name: "gpt-5", capability: "text" as const, script: "return request;" }];
        expect(mergeUpstreamModels(existing, ["gpt-5", "gpt-image-2", "veo-3", "tts-1"]).models).toEqual([existing[0], { name: "gpt-image-2", capability: "image" }, { name: "veo-3", capability: "video" }, { name: "tts-1", capability: "audio" }]);
    });

    test("ignores blank and duplicate upstream names", () => {
        const result = mergeUpstreamModels([], ["", " model-a ", "model-a"]);
        expect(result).toEqual({ models: [{ name: "model-a", capability: "text" }], addedCount: 1 });
    });
});
