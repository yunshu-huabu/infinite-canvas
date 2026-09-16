import { describe, expect, test } from "bun:test";

import { getUserAccountMenuActions } from "./user-account-menu-items";

describe("getUserAccountMenuActions", () => {
    test("places backend management before account actions for server-managed deployments", () => {
        expect(getUserAccountMenuActions(true, "admin")).toEqual([
            { key: "admin", label: "后端管理" },
            { key: "password", label: "修改密码" },
            { key: "logout", label: "退出登录", danger: true },
        ]);
    });

    test("hides backend management for normal users and local deployments", () => {
        expect(getUserAccountMenuActions(true, "user").map(({ key }) => key)).toEqual(["password", "logout"]);
        expect(getUserAccountMenuActions(false, "admin").map(({ key }) => key)).toEqual(["password", "logout"]);
    });
});
