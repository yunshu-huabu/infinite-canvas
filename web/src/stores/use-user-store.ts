import { create } from "zustand";

export type LocalUser = {
    id: number;
    username: string;
    displayName: string;
    disabled: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt: string | null;
};

type UserStore = {
    user: LocalUser | null;
    setSession: (user: LocalUser) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    setSession: (user) => set({ user }),
    clearSession: () => set({ user: null }),
}));
