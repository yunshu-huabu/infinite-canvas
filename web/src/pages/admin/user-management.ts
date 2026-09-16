import type { ManagedUser } from "@/services/admin-api";

export type ManagedUserPresentation = {
    roleLabel: "管理员" | "普通用户";
    roleColor: "gold" | "default";
    statusLabel: "启用" | "已停用";
    statusColor: "success" | "default";
    toggleLabel: "启用账号" | "停用账号";
};

export function getManagedUserPresentation(user: Pick<ManagedUser, "disabled" | "role">): ManagedUserPresentation {
    const role = user.role === "admin" ? { roleLabel: "管理员" as const, roleColor: "gold" as const } : { roleLabel: "普通用户" as const, roleColor: "default" as const };
    return user.disabled ? { ...role, statusLabel: "已停用", statusColor: "default", toggleLabel: "启用账号" } : { ...role, statusLabel: "启用", statusColor: "success", toggleLabel: "停用账号" };
}

export function getNextDisabledState(user: Pick<ManagedUser, "disabled">) {
    return !user.disabled;
}
