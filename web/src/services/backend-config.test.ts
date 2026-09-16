import { describe, expect, test } from "bun:test";

import { fetchBackendConfig } from "./backend-config";

describe("fetchBackendConfig", () => {
    test("returns a valid server-managed configuration", async () => {
        const config = { channels: [{ id: "default" }] };
        const result = await fetchBackendConfig(async () => Response.json({ config }) as Response);
        expect(result).toEqual(config as never);
    });

    test("rejects malformed responses", async () => {
        expect(fetchBackendConfig(async () => Response.json({}) as Response)).rejects.toThrow("invalid");
    });
});
