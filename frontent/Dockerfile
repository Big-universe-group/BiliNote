# === 阶段1：构建前端 ===
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 先复制 lockfile 利用依赖层缓存
COPY ./BillNote_frontend/package.json ./BillNote_frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 再复制源代码并构建,这里增加了内存限制，防止构建过程中内存溢出
COPY ./BillNote_frontend/ ./
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

# === 阶段2：使用 nginx 作为静态服务器 ===
FROM nginx:1.25-alpine

RUN rm -rf /etc/nginx/conf.d/default.conf
COPY ./BillNote_frontend/deploy/default.conf /etc/nginx/conf.d/default.conf

# 拷贝构建产物
COPY --from=builder /app/dist /usr/share/nginx/html
