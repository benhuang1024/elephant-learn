# 多阶段构建：与 java/code/shop-api/Dockerfile 的目的相同（构建产物 + 最小运行镜像）。
# ⚠️ 本仓库没有实际执行过 docker build，见 typescript/README.md 的「未验证项」。

# ---------- 1. 构建 ----------
FROM node:24-alpine AS build
WORKDIR /app

# corepack 固定 pnpm 版本，避免 lockfile 与包管理器版本漂移
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# 先只拷 manifest，最大化利用层缓存（≈ 先拷 composer.json 再 composer install）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tools/package.json ./tools/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY shop-api/package.json ./shop-api/package.json
COPY web-react/package.json ./web-react/package.json
COPY web-vue/package.json ./web-vue/package.json
COPY web-next/package.json ./web-next/package.json

# --frozen-lockfile：CI 里不允许修改 lockfile（对照 composer install --no-cache --prefer-dist）
RUN pnpm install --frozen-lockfile --filter @shop/api... 

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY shop-api ./shop-api
COPY tools ./tools

RUN pnpm --filter @shop/api build

# ---------- 2. 运行 ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# better-sqlite3 是 native 模块：alpine 需要 libc6-compat，镜像里只装生产依赖
RUN apk add --no-cache libc6-compat

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/shop-api/dist ./shop-api/dist
COPY --from=build /app/shop-api/package.json ./shop-api/package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json

# SQLite 需要一个可写目录；生产建议换成 PostgreSQL 或挂 PVC
ENV DB_FILE=/data/shop.db
VOLUME /data

EXPOSE 8080
# 非 root 运行（与 Java 镜像同样的做法）
USER node
CMD ["node", "shop-api/dist/main.js"]
