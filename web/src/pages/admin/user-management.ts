import type { ManagedUser } from "@/services/admin-api";

export type ManagedUserPresentation = {
    roleLabel: "创作用户";
    statusLabel: "启用" | "已停用";
    statusColor: "success" | "default";
    toggleLabel: "启用账号" | "停用账号";
};

export function getManagedUserPresentation(user: Pick<ManagedUser, "disabled">): ManagedUserPresentation {
    return user.disabled ? { roleLabel: "创作用户", statusLabel: "已停用", statusColor: "default", toggleLabel: "启用账号" } : { roleLabel: "创作用户", statusLabel: "启用", statusColor: "success", toggleLabel: "停用账号" };
}

export function getNextDisabledState(user: Pick<ManagedUser, "disabled">) {
    return !user.disabled;
}
