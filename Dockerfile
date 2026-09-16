# 构建 Vite 前端产物。
FROM oven/bun:1.3.13 AS web-build

WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --cache-dir=/root/.bun/install/cache
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN bun run build

# 运行镜像：Bun API 同时提供静态前端、管理员接口和 AI 渠道代理。
FROM oven/bun:1.3.13

WORKDIR /app
COPY --from=web-build /app/web/dist ./web/dist
COPY server ./server
COPY scripts ./scripts

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/web/dist

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["bun", "server/src/index.ts"]
