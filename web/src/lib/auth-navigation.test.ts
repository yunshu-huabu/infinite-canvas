import { describe, expect, test } from "bun:test";

import { safeReturnPath } from "./auth-navigation";

describe("safeReturnPath", () => {
    test("keeps local application paths", () => {
        expect(safeReturnPath({ from: "/canvas/project-1?mode=edit" })).toBe("/canvas/project-1?mode=edit");
    });

    test("rejects protocol-relative and external paths", () => {
        expect(safeReturnPath({ from: "//evil.example" })).toBe("/");
        expect(safeReturnPath({ from: "https://evil.example" })).toBe("/");
    });
});
