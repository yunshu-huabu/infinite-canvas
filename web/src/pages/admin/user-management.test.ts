import { describe, expect, test } from "bun:test";

import { getManagedUserPresentation, getNextDisabledState } from "./user-management";

describe("managed user presentation", () => {
    test("shows an enabled user with the matching disable action", () => {
        expect(getManagedUserPresentation({ disabled: false })).toEqual({
            roleLabel: "创作用户",
            statusLabel: "启用",
            statusColor: "success",
            toggleLabel: "停用账号",
        });
        expect(getNextDisabledState({ disabled: false })).toBe(true);
    });

    test("shows a disabled user with the matching enable action", () => {
        expect(getManagedUserPresentation({ disabled: true })).toEqual({
            roleLabel: "创作用户",
            statusLabel: "已停用",
            statusColor: "default",
            toggleLabel: "启用账号",
        });
        expect(getNextDisabledState({ disabled: true })).toBe(false);
    });
});
