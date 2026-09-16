export type UserStatusActionKey = "plugins" | "docs" | "language" | "theme" | "version" | "account" | "shortcuts";

export function getUserStatusActionKeys({ showPlugins, showShortcuts }: { showPlugins: boolean; showShortcuts: boolean }): UserStatusActionKey[] {
    return [...(showPlugins ? (["plugins"] as const) : []), "docs", "language", "theme", "version", "account", ...(showShortcuts ? (["shortcuts"] as const) : [])];
}
