import { beforeEach, describe, expect, test } from "bun:test";

import type { LocalUser } from "./use-user-store";
import { useUserStore } from "./use-user-store";

const user: LocalUser = {
    id: 1,
    username: "yunshu",
    displayName: "yunshu",
    disabled: false,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    lastLoginAt: null,
};

beforeEach(() => useUserStore.setState({ user: null, sessionChecked: false }));

describe("useUserStore session state", () => {
    test("marks session checking complete when a session is restored", () => {
        useUserStore.getState().setSession(user);

        expect(useUserStore.getState().user).toEqual(user);
        expect(useUserStore.getState().sessionChecked).toBe(true);
    });

    test("marks session checking complete when no session exists", () => {
        useUserStore.getState().clearSession();

        expect(useUserStore.getState().user).toBeNull();
        expect(useUserStore.getState().sessionChecked).toBe(true);
    });
});
