import { describe, expect, test } from "bun:test";

import { getUserStatusActionKeys } from "./user-status-action-keys";

describe("getUserStatusActionKeys", () => {
    test("keeps the compact top navigation without config or GitHub actions", () => {
        expect(getUserStatusActionKeys({ showPlugins: false, showShortcuts: false })).toEqual(["docs", "language", "theme", "version", "account"]);
    });

    test("preserves optional plugin and shortcut actions", () => {
        expect(getUserStatusActionKeys({ showPlugins: true, showShortcuts: true })).toEqual(["plugins", "docs", "language", "theme", "version", "account", "shortcuts"]);
    });
});
