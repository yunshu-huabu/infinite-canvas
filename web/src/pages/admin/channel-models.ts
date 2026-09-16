import { guessCapability } from "@/lib/model-capability";
import type { ModelChannel } from "@/stores/use-config-store";

export function mergeUpstreamModels(existing: ModelChannel["models"], upstreamNames: string[]) {
    const seen = new Set(existing.map((model) => model.name));
    const additions = upstreamNames
        .map((name) => name.trim())
        .filter((name) => {
            if (!name || seen.has(name)) return false;
            seen.add(name);
            return true;
        })
        .map((name) => {
            return { name, capability: guessCapability(name) };
        });
    return { models: [...existing, ...additions], addedCount: additions.length };
}
