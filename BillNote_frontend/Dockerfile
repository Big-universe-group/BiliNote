# === 前端静态文件服务 ===
# 假设前端已经通过宿主机上的 pnpm install && pnpm run build 构建完成
# 构建产物位于 BillNote_frontend/dist 目录

FROM nginx:1.25-alpine

# 删除默认配置（可选）
RUN rm -rf /etc/nginx/conf.d/default.conf
COPY ./BillNote_frontend/deploy/default.conf /etc/nginx/conf.d/default.conf

# 拷贝构建产物（假设 dist 目录已存在）
COPY ./BillNote_frontend/dist /usr/share/nginx/html

# 设置正确的文件权限（确保nginx用户可以读取）
RUN chmod -R 644 /usr/share/nginx/html && \
    chmod -R +X /usr/share/nginx/html