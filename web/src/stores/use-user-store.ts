import { create } from "zustand";

export type LocalUser = {
    id: number;
    username: string;
    displayName: string;
    role: "admin" | "user";
    disabled: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt: string | null;
};

type UserStore = {
    user: LocalUser | null;
    sessionChecked: boolean;
    setSession: (user: LocalUser) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    sessionChecked: false,
    setSession: (user) => set({ user, sessionChecked: true }),
    clearSession: () => set({ user: null, sessionChecked: true }),
}));
