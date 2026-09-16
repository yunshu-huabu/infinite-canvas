import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("local access scripts", () => {
    test("binds development and preview servers to the local machine", () => {
        const packageJson = JSON.parse(readFileSync(resolve(import.meta.dir, "../../package.json"), "utf8"));

        expect(packageJson.scripts.dev).toContain("--host 127.0.0.1");
        expect(packageJson.scripts.start).toContain("--host 127.0.0.1");
        expect(packageJson.scripts.dev).not.toContain("0.0.0.0");
        expect(packageJson.scripts.start).not.toContain("0.0.0.0");
    });
});
