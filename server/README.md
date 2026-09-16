# Infinite Canvas Server

同一进程提供以下能力：

- React 静态站点与 SPA fallback
- SQLite 持久化
- 管理员会话与密码管理
- 创作用户登录、改密与会话管理
- 管理员用户创建、停用、重置密码与删除
- 加密的 AI 渠道配置
- 服务端 AI API 代理
- 请求统计与管理员审计日志

## 本地开发

在仓库根目录运行：

```bash
bun run dev
```

前端地址为 `http://localhost:3000`，开发 API 监听 `http://127.0.0.1:3001`，由 Vite 自动代理。

首次启动会在终端打印管理员用户名和随机密码。也可以提前设置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `CONFIG_ENCRYPTION_KEY`。

## 生产运行

```bash
bun run build
bun run start
```

数据默认保存在 `./data`。Docker 部署应持久化 `/app/data`。
