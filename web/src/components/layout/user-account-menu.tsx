import { App, Button, Dropdown, Form, Input, Modal, type MenuProps } from "antd";
import { KeyRound, LogOut, ServerCog, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { userApi } from "@/services/user-api";
import { getUserAccountMenuActions, type UserAccountMenuAction } from "@/components/layout/user-account-menu-items";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function UserAccountMenu({ className, style }: { className: string; style?: React.CSSProperties }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const user = useUserStore((state) => state.user);
    const backendManaged = useConfigStore((state) => state.backendManaged);
    const clearSession = useUserStore((state) => state.clearSession);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    if (!user) return null;

    const logout = async () => {
        try {
            await userApi.logout();
        } finally {
            clearSession();
            navigate("/login", { replace: true });
        }
    };

    const changePassword = async (values: { currentPassword: string; newPassword: string }) => {
        setSaving(true);
        try {
            await userApi.changePassword(values.currentPassword, values.newPassword);
            message.success("密码已更新，请重新登录");
            clearSession();
            setPasswordOpen(false);
            navigate("/login", { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "密码更新失败");
        } finally {
            setSaving(false);
        }
    };

    const actionIcons: Record<UserAccountMenuAction["key"], React.ReactNode> = {
        admin: <ServerCog className="size-4" />,
        password: <KeyRound className="size-4" />,
        logout: <LogOut className="size-4" />,
    };
    const actionHandlers: Record<UserAccountMenuAction["key"], () => void> = {
        admin: () => navigate("/admin"),
        password: () => setPasswordOpen(true),
        logout: () => void logout(),
    };
    const actionItems: MenuProps["items"] = getUserAccountMenuActions(backendManaged).map(({ key, label, danger }) => ({
        key,
        icon: actionIcons[key],
        label,
        danger,
        onClick: actionHandlers[key],
    }));
    const items: MenuProps["items"] = [
        {
            key: "identity",
            label: (
                <div className="px-1 py-1">
                    <div className="text-sm font-medium">{user.displayName}</div>
                    <div className="text-xs text-stone-500">@{user.username}</div>
                </div>
            ),
            disabled: true,
        },
        { type: "divider" },
        ...actionItems,
    ];

    return (
        <>
            <Dropdown menu={{ items }} placement="bottomRight" trigger={["click"]}>
                <button type="button" className={className} style={style} aria-label="用户菜单" title={user.displayName}>
                    <UserRound className="size-4" />
                </button>
            </Dropdown>
            <Modal title="修改登录密码" open={passwordOpen} onCancel={() => setPasswordOpen(false)} footer={null} destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => void changePassword(values)}>
                    <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}>
                        <Input.Password autoComplete="current-password" />
                    </Form.Item>
                    <Form.Item name="newPassword" label="新密码" extra="至少 8 个字符" rules={[{ required: true }, { min: 8 }]}>
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item
                        name="confirmPassword"
                        label="确认新密码"
                        dependencies={["newPassword"]}
                        rules={[
                            { required: true },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    return value === getFieldValue("newPassword") ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致"));
                                },
                            }),
                        ]}
                    >
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setPasswordOpen(false)}>取消</Button>
                        <Button type="primary" htmlType="submit" loading={saving}>
                            更新密码
                        </Button>
                    </div>
                </Form>
            </Modal>
        </>
    );
}
