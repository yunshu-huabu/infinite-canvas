export type UserAccountMenuAction = {
    key: "admin" | "password" | "logout";
    label: string;
    danger?: boolean;
};

export function getUserAccountMenuActions(backendManaged: boolean): UserAccountMenuAction[] {
    return [...(backendManaged ? ([{ key: "admin", label: "后端管理" }] satisfies UserAccountMenuAction[]) : []), { key: "password", label: "修改密码" }, { key: "logout", label: "退出登录", danger: true }];
}
