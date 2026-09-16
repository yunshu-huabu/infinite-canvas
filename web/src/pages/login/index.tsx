import { App, Button, Form, Input, Spin } from "antd";
import { ArrowRight, Brush, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { userApi } from "@/services/user-api";
import { useUserStore } from "@/stores/use-user-store";
import { safeReturnPath } from "@/lib/auth-navigation";

export default function LoginPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useUserStore((state) => state.user);
    const setSession = useUserStore((state) => state.setSession);
    const [checking, setChecking] = useState(!user);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (user) return;
        userApi
            .session()
            .then(({ user: sessionUser }) => setSession(sessionUser))
            .catch(() => undefined)
            .finally(() => setChecking(false));
    }, [setSession, user]);

    if (checking)
        return (
            <div className="flex h-dvh items-center justify-center bg-stone-950">
                <Spin size="large" />
            </div>
        );
    if (user) return <Navigate to={safeReturnPath(location.state)} replace />;

    const login = async (values: { username: string; password: string }) => {
        setSubmitting(true);
        try {
            const result = await userApi.login(values.username, values.password);
            setSession(result.user);
            navigate(safeReturnPath(location.state), { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="grid h-dvh overflow-hidden bg-stone-950 text-stone-100 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <section className="relative hidden overflow-hidden border-r border-white/10 lg:block">
                <div className="absolute inset-0 opacity-35" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_32%_38%,rgba(16,185,129,.25),transparent_38%),radial-gradient(circle_at_70%_72%,rgba(244,114,182,.14),transparent_30%)]" />
                <div className="relative flex h-full flex-col justify-between p-12">
                    <div className="flex items-center gap-3">
                        <img src="/logo.svg" alt="无限画布" className="size-9 invert" />
                        <span className="text-base font-semibold">无限画布</span>
                    </div>
                    <div className="max-w-xl">
                        <div className="mb-5 flex size-12 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                            <Brush className="size-5" />
                        </div>
                        <h1 className="text-4xl font-semibold leading-tight">
                            让每一次生成，
                            <br />
                            都成为下一次创作的起点。
                        </h1>
                        <p className="mt-5 max-w-lg text-base leading-7 text-stone-400">登录后进入你的画布工作台。模型与密钥由管理员统一维护，你只需要专注于创作。</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                        <ShieldCheck className="size-4 text-emerald-400" />
                        会话由后端安全管理，浏览器不保存密码或 API Key
                    </div>
                </div>
            </section>
            <section className="flex items-center justify-center px-6 py-10 sm:px-10">
                <div className="w-full max-w-sm">
                    <div className="mb-8 lg:hidden">
                        <div className="mb-7 flex items-center gap-3">
                            <img src="/logo.svg" alt="无限画布" className="size-9 invert" />
                            <span className="text-base font-semibold">无限画布</span>
                        </div>
                    </div>
                    <div className="mb-7">
                        <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-white text-stone-950">
                            <LockKeyhole className="size-4" />
                        </div>
                        <h2 className="text-2xl font-semibold">登录创作空间</h2>
                        <p className="mt-2 text-sm text-stone-400">使用管理员为你创建的账号</p>
                    </div>
                    <Form layout="vertical" requiredMark={false} onFinish={(values) => void login(values)}>
                        <Form.Item name="username" label={<span className="text-stone-300">用户名</span>} rules={[{ required: true, message: "请输入用户名" }]}>
                            <Input size="large" autoComplete="username" autoFocus />
                        </Form.Item>
                        <Form.Item name="password" label={<span className="text-stone-300">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                            <Input.Password size="large" autoComplete="current-password" />
                        </Form.Item>
                        <Button htmlType="submit" type="primary" size="large" block loading={submitting} icon={<ArrowRight className="size-4" />} iconPosition="end" className="!mt-2">
                            进入工作台
                        </Button>
                    </Form>
                    <p className="mt-6 text-center text-xs text-stone-500">没有账号时，请联系管理员在后台创建。</p>
                </div>
            </section>
        </main>
    );
}
