import { describe, expect, test } from "bun:test";

import { getUserAccountMenuActions } from "./user-account-menu-items";

describe("getUserAccountMenuActions", () => {
    test("places backend management before account actions for server-managed deployments", () => {
        expect(getUserAccountMenuActions(true)).toEqual([
            { key: "admin", label: "后端管理" },
            { key: "password", label: "修改密码" },
            { key: "logout", label: "退出登录", danger: true },
        ]);
    });

    test("hides backend management for local deployments", () => {
        expect(getUserAccountMenuActions(false).map(({ key }) => key)).toEqual(["password", "logout"]);
    });
});
