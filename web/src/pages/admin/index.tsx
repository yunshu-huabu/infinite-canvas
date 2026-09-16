import { App, Button, Form, Input, Modal, Popconfirm, Select, Spin, Switch, Table, Tag, Tooltip } from "antd";
import { Activity, ArrowLeft, AudioLines, BookOpenCheck, Boxes, Gauge, Image, KeyRound, LogOut, Pencil, Plus, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck, Trash2, UserPlus, Users, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { adminApi, type AdminConfig, type AdminUser, type AuditLog, type DashboardData, type ManagedUser } from "@/services/admin-api";
import { createModelChannel, encodeChannelModel, type ModelCapability } from "@/stores/use-config-store";

type Section = "overview" | "users" | "channels" | "defaults" | "audit" | "security";

const capabilityOptions = [
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "text", label: "文本" },
    { value: "audio", label: "音频" },
];

export default function AdminPage() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<AdminUser | null>(null);
    const [section, setSection] = useState<Section>("overview");
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [config, setConfig] = useState<AdminConfig | null>(null);
    const [audits, setAudits] = useState<AuditLog[]>([]);
    const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        const [dashboardData, configData, auditData, userData] = await Promise.all([adminApi.dashboard(), adminApi.config(), adminApi.auditLogs(), adminApi.users()]);
        setDashboard(dashboardData);
        setConfig(configData.config);
        setAudits(auditData.logs);
        setManagedUsers(userData.users);
    }, []);

    useEffect(() => {
        adminApi
            .session()
            .then(async ({ user: sessionUser }) => {
                setUser(sessionUser);
                await loadData();
            })
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, [loadData]);

    const login = async (values: { username: string; password: string }) => {
        setLoading(true);
        try {
            const result = await adminApi.login(values.username, values.password);
            setUser(result.user);
            await loadData();
        } catch (error) {
            message.error(readError(error));
        } finally {
            setLoading(false);
        }
    };

    const save = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const result = await adminApi.saveConfig(config);
            setConfig(result.config);
            await loadData();
            message.success("后端配置已保存并立即生效");
        } catch (error) {
            message.error(readError(error));
        } finally {
            setSaving(false);
        }
    };

    if (loading && !user)
        return (
            <div className="flex h-dvh items-center justify-center bg-stone-950">
                <Spin size="large" />
            </div>
        );
    if (!user) return <AdminLogin onLogin={login} loading={loading} />;

    const logout = async () => {
        await adminApi.logout();
        setUser(null);
    };

    return (
        <div className="flex h-dvh overflow-hidden bg-stone-100 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
            <aside className="flex w-16 shrink-0 flex-col border-r border-stone-200 bg-white sm:w-60 dark:border-stone-800 dark:bg-stone-900">
                <div className="flex h-16 items-center justify-center gap-3 border-b border-stone-200 px-3 sm:justify-start sm:px-5 dark:border-stone-800">
                    <span className="flex size-8 items-center justify-center rounded-md bg-emerald-600 text-white">
                        <ShieldCheck className="size-4" />
                    </span>
                    <div className="hidden min-w-0 sm:block">
                        <div className="truncate text-sm font-semibold">无限画布管理台</div>
                        <div className="text-[11px] text-stone-500">SERVER CONTROL</div>
                    </div>
                </div>
                <nav className="flex-1 space-y-1 p-3">
                    <AdminNav active={section} value="overview" icon={Gauge} label="运行概览" onClick={setSection} />
                    <AdminNav active={section} value="users" icon={Users} label="用户管理" onClick={setSection} />
                    <AdminNav active={section} value="channels" icon={Boxes} label="AI 渠道" onClick={setSection} />
                    <AdminNav active={section} value="defaults" icon={Settings2} label="默认配置" onClick={setSection} />
                    <AdminNav active={section} value="audit" icon={BookOpenCheck} label="审计日志" onClick={setSection} />
                    <AdminNav active={section} value="security" icon={KeyRound} label="账号安全" onClick={setSection} />
                </nav>
                <div className="border-t border-stone-200 p-3 dark:border-stone-800">
                    <div className="mb-2 hidden px-2 text-xs text-stone-500 sm:block">已登录：{user.username}</div>
                    <Tooltip title="退出登录">
                        <Button block type="text" icon={<LogOut className="size-4" />} onClick={() => void logout()}>
                            <span className="hidden sm:inline">退出登录</span>
                        </Button>
                    </Tooltip>
                </div>
            </aside>
            <main className="min-w-0 flex-1 overflow-y-auto">
                <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-4 backdrop-blur sm:px-7 dark:border-stone-800 dark:bg-stone-900/95">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{sectionTitle(section)}</div>
                        <div className="hidden truncate text-xs text-stone-500 lg:block">全局配置由服务端统一下发，保存后对所有浏览器生效</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to="/">
                            <Tooltip title="返回创作端">
                                <Button icon={<ArrowLeft className="size-4" />}>
                                    <span className="hidden md:inline">返回创作端</span>
                                </Button>
                            </Tooltip>
                        </Link>
                        {(section === "channels" || section === "defaults") && (
                            <Button type="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => void save()}>
                                <span className="hidden md:inline">保存配置</span>
                            </Button>
                        )}
                    </div>
                </header>
                <div className="mx-auto max-w-7xl p-4 sm:p-7">
                    {section === "overview" && dashboard ? <Overview data={dashboard} onRefresh={() => void loadData()} /> : null}
                    {section === "users" ? <UsersManager users={managedUsers} onRefresh={loadData} /> : null}
                    {section === "channels" && config ? <ChannelsEditor config={config} onChange={setConfig} /> : null}
                    {section === "defaults" && config ? <DefaultsEditor config={config} onChange={setConfig} /> : null}
                    {section === "audit" ? <AuditLogs logs={audits} /> : null}
                    {section === "security" ? <SecuritySettings user={user} onSignedOut={() => setUser(null)} /> : null}
                </div>
            </main>
        </div>
    );
}

function AdminLogin({ onLogin, loading }: { onLogin: (values: { username: string; password: string }) => Promise<void>; loading: boolean }) {
    return (
        <main className="grid h-dvh place-items-center bg-stone-950 px-5 text-stone-100">
            <div className="w-full max-w-sm">
                <div className="mb-8 flex items-center gap-4">
                    <span className="flex size-11 items-center justify-center rounded-md bg-emerald-500 text-stone-950">
                        <ShieldCheck className="size-5" />
                    </span>
                    <div>
                        <h1 className="text-xl font-semibold">后端管理控制台</h1>
                        <p className="mt-1 text-sm text-stone-400">管理渠道密钥、模型与全局生成参数</p>
                    </div>
                </div>
                <Form layout="vertical" initialValues={{ username: "admin" }} onFinish={(values) => void onLogin(values)} requiredMark={false}>
                    <Form.Item name="username" label={<span className="text-stone-300">用户名</span>} rules={[{ required: true }]}>
                        <Input size="large" autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label={<span className="text-stone-300">密码</span>} rules={[{ required: true }]}>
                        <Input.Password size="large" autoComplete="current-password" />
                    </Form.Item>
                    <Button htmlType="submit" type="primary" size="large" block loading={loading} className="!mt-2">
                        登录
                    </Button>
                </Form>
                <Link to="/" className="mt-6 flex items-center justify-center gap-2 text-sm text-stone-400 hover:text-white">
                    <ArrowLeft className="size-4" />
                    返回无限画布
                </Link>
            </div>
        </main>
    );
}

function Overview({ data, onRefresh }: { data: DashboardData; onRefresh: () => void }) {
    const metrics = [
        { label: "24 小时请求", value: data.requests24h, hint: "所有后端代理调用", icon: Activity },
        { label: "失败请求", value: data.failed24h, hint: data.requests24h ? `${Math.round((data.failed24h / data.requests24h) * 100)}% 失败率` : "暂无请求", icon: ShieldCheck },
        { label: "平均响应", value: `${data.averageMs24h} ms`, hint: "24 小时平均耗时", icon: Gauge },
        { label: "模型资源", value: `${data.channelCount} / ${data.modelCount}`, hint: "渠道 / 模型", icon: Boxes },
        { label: "创作用户", value: data.userCount, hint: "已创建用户账号", icon: Users },
    ];
    return (
        <div className="space-y-7">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">服务运行概览</h1>
                    <p className="mt-1 text-sm text-stone-500">配置更新于 {formatTime(data.configUpdatedAt)}</p>
                </div>
                <Tooltip title="刷新">
                    <Button shape="circle" icon={<RefreshCw className="size-4" />} onClick={onRefresh} />
                </Tooltip>
            </div>
            <section className="grid border-y border-stone-200 sm:grid-cols-2 xl:grid-cols-5 dark:border-stone-800">
                {metrics.map(({ label, value, hint, icon: Icon }, index) => (
                    <div key={label} className={`px-5 py-5 ${index ? "border-l border-stone-200 dark:border-stone-800" : ""}`}>
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Icon className="size-4" />
                            {label}
                        </div>
                        <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
                        <div className="mt-1 text-xs text-stone-500">{hint}</div>
                    </div>
                ))}
            </section>
            <section>
                <h2 className="mb-3 text-sm font-semibold">最近请求</h2>
                <RequestTable rows={data.recentRequests} />
            </section>
        </div>
    );
}

function ChannelsEditor({ config, onChange }: { config: AdminConfig; onChange: (config: AdminConfig) => void }) {
    const updateChannel = (index: number, patch: Partial<AdminConfig["channels"][number]>) => onChange({ ...config, channels: config.channels.map((channel, itemIndex) => (itemIndex === index ? { ...channel, ...patch } : channel)) });
    const addChannel = () => onChange({ ...config, channels: [...config.channels, { ...createModelChannel({ name: `渠道 ${config.channels.length + 1}` }), hasApiKey: false }] });
    const deleteChannel = (index: number) => onChange({ ...config, channels: config.channels.filter((_, itemIndex) => itemIndex !== index) });
    return (
        <div>
            <div className="mb-6 flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">AI 渠道</h1>
                    <p className="mt-1 text-sm text-stone-500">密钥只在服务端加密保存，前端请求经对应渠道代理转发。</p>
                </div>
                <Button icon={<Plus className="size-4" />} onClick={addChannel}>
                    新增渠道
                </Button>
            </div>
            <div className="space-y-5">
                {config.channels.map((channel, index) => (
                    <section key={`${channel.id}-${index}`} className="border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
                        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-800">
                            <div>
                                <div className="font-semibold">{channel.name || "未命名渠道"}</div>
                                <div className="mt-1 text-xs text-stone-500">
                                    {channel.apiFormat.toUpperCase()} · {channel.models.length} 个模型 · {channel.hasApiKey ? "密钥已保存" : "未配置密钥"}
                                </div>
                            </div>
                            <Popconfirm title="删除这个渠道？" disabled={config.channels.length <= 1} onConfirm={() => deleteChannel(index)}>
                                <Button danger type="text" disabled={config.channels.length <= 1} icon={<Trash2 className="size-4" />} />
                            </Popconfirm>
                        </div>
                        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
                            <Form.Item label="渠道名称" className="mb-0">
                                <Input value={channel.name} onChange={(event) => updateChannel(index, { name: event.target.value })} />
                            </Form.Item>
                            <Form.Item label="渠道 ID" className="mb-0">
                                <Input value={channel.id} onChange={(event) => updateChannel(index, { id: event.target.value.replace(/[^a-zA-Z0-9_-]/g, "-") })} />
                            </Form.Item>
                            <Form.Item label="接口协议" className="mb-0">
                                <Select
                                    value={channel.apiFormat}
                                    options={[
                                        { value: "openai", label: "OpenAI 兼容" },
                                        { value: "gemini", label: "Gemini" },
                                    ]}
                                    onChange={(apiFormat) => updateChannel(index, { apiFormat })}
                                />
                            </Form.Item>
                            <Form.Item label={channel.hasApiKey ? "API Key（留空保持不变）" : "API Key"} className="mb-0">
                                <div className="flex gap-2">
                                    <Input.Password
                                        value={channel.apiKey}
                                        placeholder={channel.hasApiKey && !channel.clearApiKey ? "已安全保存" : "输入 API Key"}
                                        onChange={(event) => updateChannel(index, { apiKey: event.target.value, clearApiKey: false })}
                                    />
                                    {channel.hasApiKey ? (
                                        <Button danger disabled={channel.clearApiKey} onClick={() => updateChannel(index, { apiKey: "", clearApiKey: true, hasApiKey: false })}>
                                            清除
                                        </Button>
                                    ) : null}
                                </div>
                            </Form.Item>
                            <Form.Item label="Base URL" className="mb-0 md:col-span-2 xl:col-span-4">
                                <Input value={channel.baseUrl} placeholder="https://api.openai.com" onChange={(event) => updateChannel(index, { baseUrl: event.target.value })} />
                            </Form.Item>
                        </div>
                        <div className="border-t border-stone-200 dark:border-stone-800">
                            <div className="flex items-center justify-between px-5 py-3">
                                <span className="text-sm font-semibold">模型列表</span>
                                <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => updateChannel(index, { models: [...channel.models, { name: "", capability: "text" }] })}>
                                    添加模型
                                </Button>
                            </div>
                            <div className="divide-y divide-stone-200 border-t border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                                {channel.models.map((model, modelIndex) => (
                                    <div key={modelIndex} className="grid items-center gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_160px_40px]">
                                        <Input
                                            value={model.name}
                                            placeholder="模型名称"
                                            onChange={(event) => updateChannel(index, { models: channel.models.map((item, itemIndex) => (itemIndex === modelIndex ? { ...item, name: event.target.value } : item)) })}
                                        />
                                        <Select
                                            value={model.capability}
                                            options={capabilityOptions}
                                            onChange={(capability) => updateChannel(index, { models: channel.models.map((item, itemIndex) => (itemIndex === modelIndex ? { ...item, capability } : item)) })}
                                        />
                                        <Tooltip title="删除模型">
                                            <Button type="text" danger icon={<Trash2 className="size-4" />} onClick={() => updateChannel(index, { models: channel.models.filter((_, itemIndex) => itemIndex !== modelIndex) })} />
                                        </Tooltip>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}

function DefaultsEditor({ config, onChange }: { config: AdminConfig; onChange: (config: AdminConfig) => void }) {
    const options = (capability: ModelCapability) =>
        config.channels.flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => ({ value: encodeChannelModel(channel.id, model.name), label: `${model.name} · ${channel.name}` })));
    const set = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => onChange({ ...config, [key]: value });
    return (
        <div className="max-w-5xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">默认配置</h1>
                <p className="mt-1 text-sm text-stone-500">控制所有创作端默认使用的模型和生成参数。</p>
            </div>
            <section className="border-y border-stone-200 py-5 dark:border-stone-800">
                <h2 className="mb-4 text-sm font-semibold">默认模型</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <DefaultModel icon={Image} label="图片模型" value={config.imageModel} options={options("image")} onChange={(value) => set("imageModel", value)} />
                    <DefaultModel icon={Video} label="视频模型" value={config.videoModel} options={options("video")} onChange={(value) => set("videoModel", value)} />
                    <DefaultModel icon={Activity} label="文本模型" value={config.textModel} options={options("text")} onChange={(value) => set("textModel", value)} />
                    <DefaultModel icon={AudioLines} label="音频模型" value={config.audioModel} options={options("audio")} onChange={(value) => set("audioModel", value)} />
                </div>
            </section>
            <section className="py-5">
                <h2 className="mb-4 text-sm font-semibold">生成参数</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    <Form.Item label="画布默认出图数">
                        <Input type="number" min={1} max={15} value={config.canvasImageCount} onChange={(event) => set("canvasImageCount", event.target.value)} />
                    </Form.Item>
                    <Form.Item label="默认图片质量">
                        <Select value={config.quality} options={["auto", "low", "medium", "high"].map((value) => ({ value, label: value }))} onChange={(value) => set("quality", value)} />
                    </Form.Item>
                    <Form.Item label="文本推理强度">
                        <Select value={config.reasoningEffort} options={["auto", "low", "medium", "high", "xhigh"].map((value) => ({ value, label: value }))} onChange={(value) => set("reasoningEffort", value)} />
                    </Form.Item>
                    <Form.Item label="默认视频秒数">
                        <Input type="number" min={1} max={60} value={config.videoSeconds} onChange={(event) => set("videoSeconds", event.target.value)} />
                    </Form.Item>
                    <Form.Item label="默认视频清晰度">
                        <Select value={config.vquality} options={["480", "720", "1080", "1440", "2160"].map((value) => ({ value, label: `${value}p` }))} onChange={(value) => set("vquality", value)} />
                    </Form.Item>
                    <Form.Item label="默认音频声线">
                        <Input value={config.audioVoice} onChange={(event) => set("audioVoice", event.target.value)} />
                    </Form.Item>
                </div>
                <Form.Item label="全局系统提示词" extra="所有文本模型请求都会携带该提示词">
                    <Input.TextArea rows={6} value={config.systemPrompt} onChange={(event) => set("systemPrompt", event.target.value)} />
                </Form.Item>
            </section>
        </div>
    );
}

function UsersManager({ users, onRefresh }: { users: ManagedUser[]; onRefresh: () => Promise<void> }) {
    const { message } = App.useApp();
    const [createOpen, setCreateOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
    const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const [resetForm] = Form.useForm();

    const run = async (action: () => Promise<unknown>, success: string) => {
        setSubmitting(true);
        try {
            await action();
            await onRefresh();
            message.success(success);
            return true;
        } catch (error) {
            message.error(readError(error));
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const create = async (values: { username: string; displayName: string; password: string }) => {
        if (await run(() => adminApi.createUser(values), "用户已创建")) {
            setCreateOpen(false);
            createForm.resetFields();
        }
    };

    const edit = async (values: { displayName: string; disabled: boolean }) => {
        if (!editingUser) return;
        if (await run(() => adminApi.updateUser(editingUser.id, values), "用户信息已更新")) setEditingUser(null);
    };

    const resetPassword = async (values: { password: string }) => {
        if (!resetUser) return;
        if (await run(() => adminApi.resetUserPassword(resetUser.id, values.password), "密码已重置，用户需要重新登录")) {
            setResetUser(null);
            resetForm.resetFields();
        }
    };

    const openEdit = (user: ManagedUser) => {
        setEditingUser(user);
        editForm.setFieldsValue({ displayName: user.displayName, disabled: user.disabled });
    };

    return (
        <div>
            <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">用户管理</h1>
                    <p className="mt-1 text-sm text-stone-500">创建创作端账号、停用访问权限或重置用户密码。</p>
                </div>
                <Button type="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreateOpen(true)}>
                    新建用户
                </Button>
            </div>
            <Table
                rowKey="id"
                dataSource={users}
                pagination={{ pageSize: 15 }}
                columns={[
                    {
                        title: "用户",
                        key: "identity",
                        render: (_, user) => (
                            <div>
                                <div className="font-medium">{user.displayName}</div>
                                <div className="text-xs text-stone-500">@{user.username}</div>
                            </div>
                        ),
                    },
                    { title: "状态", dataIndex: "disabled", width: 110, render: (disabled) => <Tag color={disabled ? "default" : "success"}>{disabled ? "已停用" : "正常"}</Tag> },
                    { title: "上次登录", dataIndex: "lastLoginAt", width: 190, render: (value) => (value ? formatTime(value) : "从未登录") },
                    { title: "创建时间", dataIndex: "createdAt", width: 190, render: formatTime },
                    {
                        title: "操作",
                        key: "actions",
                        width: 160,
                        render: (_, user) => (
                            <div className="flex gap-1">
                                <Tooltip title="编辑">
                                    <Button type="text" icon={<Pencil className="size-4" />} onClick={() => openEdit(user)} />
                                </Tooltip>
                                <Tooltip title="重置密码">
                                    <Button type="text" icon={<RotateCcw className="size-4" />} onClick={() => setResetUser(user)} />
                                </Tooltip>
                                <Popconfirm title={`删除用户 ${user.username}？`} description="该用户的所有登录会话会立即失效。" onConfirm={() => void run(() => adminApi.deleteUser(user.id), "用户已删除")}>
                                    <Tooltip title="删除">
                                        <Button type="text" danger icon={<Trash2 className="size-4" />} />
                                    </Tooltip>
                                </Popconfirm>
                            </div>
                        ),
                    },
                ]}
            />

            <Modal title="新建创作用户" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnHidden>
                <Form form={createForm} layout="vertical" requiredMark={false} onFinish={(values) => void create(values)}>
                    <Form.Item name="username" label="用户名" extra="3-32 位字母、数字、点、下划线或短横线" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9_.-]{3,32}$/, message: "用户名格式不正确" }]}>
                        <Input autoComplete="off" />
                    </Form.Item>
                    <Form.Item name="displayName" label="显示名称" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="password" label="初始密码" extra="至少 8 个字符" rules={[{ required: true }, { min: 8 }]}>
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setCreateOpen(false)}>取消</Button>
                        <Button type="primary" htmlType="submit" loading={submitting}>
                            创建用户
                        </Button>
                    </div>
                </Form>
            </Modal>

            <Modal title={`编辑用户 · ${editingUser?.username || ""}`} open={Boolean(editingUser)} onCancel={() => setEditingUser(null)} footer={null} destroyOnHidden>
                <Form form={editForm} layout="vertical" requiredMark={false} onFinish={(values) => void edit(values)}>
                    <Form.Item name="displayName" label="显示名称" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="disabled" label="停用账号" valuePropName="checked" extra="停用后，该用户的已有会话会立即失效。">
                        <Switch />
                    </Form.Item>
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setEditingUser(null)}>取消</Button>
                        <Button type="primary" htmlType="submit" loading={submitting}>
                            保存
                        </Button>
                    </div>
                </Form>
            </Modal>

            <Modal title={`重置密码 · ${resetUser?.username || ""}`} open={Boolean(resetUser)} onCancel={() => setResetUser(null)} footer={null} destroyOnHidden>
                <Form form={resetForm} layout="vertical" requiredMark={false} onFinish={(values) => void resetPassword(values)}>
                    <Form.Item name="password" label="新密码" extra="至少 8 个字符；保存后该用户需要重新登录" rules={[{ required: true }, { min: 8 }]}>
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setResetUser(null)}>取消</Button>
                        <Button type="primary" htmlType="submit" loading={submitting}>
                            重置密码
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}

function AuditLogs({ logs }: { logs: AuditLog[] }) {
    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">审计日志</h1>
                <p className="mt-1 text-sm text-stone-500">记录管理员登录、配置更新和安全操作。</p>
            </div>
            <Table
                rowKey="id"
                pagination={{ pageSize: 20 }}
                dataSource={logs}
                columns={[
                    { title: "时间", dataIndex: "created_at", width: 180, render: formatTime },
                    { title: "管理员", dataIndex: "username", width: 120, render: (value) => value || "系统" },
                    { title: "操作", dataIndex: "action", width: 180, render: (value) => <Tag>{value}</Tag> },
                    { title: "目标", dataIndex: "target", width: 140 },
                    { title: "来源", dataIndex: "ip", width: 140 },
                    { title: "详情", dataIndex: "detail", ellipsis: true },
                ]}
            />
        </div>
    );
}

function SecuritySettings({ user, onSignedOut }: { user: AdminUser; onSignedOut: () => void }) {
    const { message } = App.useApp();
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const submit = async (values: { currentPassword: string; newPassword: string }) => {
        setSaving(true);
        try {
            await adminApi.changePassword(values.currentPassword, values.newPassword);
            message.success("密码已更新，请重新登录");
            onSignedOut();
        } catch (error) {
            message.error(readError(error));
        } finally {
            setSaving(false);
        }
    };
    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">账号安全</h1>
                <p className="mt-1 text-sm text-stone-500">
                    管理员 {user.username} · 上次登录 {user.lastLoginAt ? formatTime(user.lastLoginAt) : "首次登录"}
                </p>
            </div>
            <section className="border-y border-stone-200 py-5 dark:border-stone-800">
                <h2 className="mb-4 text-sm font-semibold">修改密码</h2>
                <Form form={form} layout="vertical" onFinish={(values) => void submit(values)} requiredMark={false}>
                    <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true }]}>
                        <Input.Password autoComplete="current-password" />
                    </Form.Item>
                    <Form.Item name="newPassword" label="新密码" extra="至少 12 个字符；更新后所有已有会话都会失效" rules={[{ required: true }, { min: 12 }]}>
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
                                    return !value || getFieldValue("newPassword") === value ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致"));
                                },
                            }),
                        ]}
                    >
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={saving}>
                        更新密码
                    </Button>
                </Form>
            </section>
        </div>
    );
}

function AdminNav({ active, value, icon: Icon, label, onClick }: { active: Section; value: Section; icon: typeof Gauge; label: string; onClick: (value: Section) => void }) {
    return (
        <Tooltip title={label} placement="right">
            <button
                type="button"
                aria-label={label}
                onClick={() => onClick(value)}
                className={`flex h-10 w-full items-center justify-center gap-3 rounded-md px-3 text-sm transition sm:justify-start ${active === value ? "bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`}
            >
                <Icon className="size-4 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
            </button>
        </Tooltip>
    );
}

function DefaultModel({ icon: Icon, label, value, options, onChange }: { icon: typeof Image; label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
    return (
        <Form.Item
            label={
                <span className="inline-flex items-center gap-2">
                    <Icon className="size-4" />
                    {label}
                </span>
            }
        >
            <Select value={value || undefined} options={options} placeholder="暂无可用模型" onChange={onChange} />
        </Form.Item>
    );
}

function RequestTable({ rows }: { rows: DashboardData["recentRequests"] }) {
    return (
        <Table
            rowKey={(row) => `${row.created_at}-${row.channel_id}-${row.path}`}
            pagination={false}
            dataSource={rows}
            columns={[
                { title: "时间", dataIndex: "created_at", width: 180, render: formatTime },
                { title: "渠道", dataIndex: "channel_id", width: 140 },
                { title: "方法", dataIndex: "method", width: 90 },
                { title: "路径", dataIndex: "path", ellipsis: true },
                { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag color={value >= 400 ? "error" : "success"}>{value}</Tag> },
                { title: "耗时", dataIndex: "duration_ms", width: 110, render: (value) => `${value} ms` },
            ]}
        />
    );
}

function sectionTitle(section: Section) {
    return { overview: "运行概览", users: "用户管理", channels: "AI 渠道", defaults: "默认配置", audit: "审计日志", security: "账号安全" }[section];
}
function formatTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
function readError(error: unknown) {
    return error instanceof Error ? error.message : "操作失败";
}
