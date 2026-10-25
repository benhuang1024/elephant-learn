#!/usr/bin/env bash
# 把实验用到的公共镜像同步到你自己的 ACR。
# 原因：中国内地地域的 ACK 节点访问 Docker Hub 经常失败或很慢；同步后节点走 ACR 的 VPC 内网地址拉取。
#
# 用法：
#   docker login <ACR 登录地址>
#   REGISTRY=<ACR 登录地址>/<命名空间> ./sync-images.sh
# 例子：
#   REGISTRY=registry.cn-hangzhou.aliyuncs.com/my-ns ./sync-images.sh
set -euo pipefail

: "${REGISTRY:?请先设置 REGISTRY，例如 registry.cn-hangzhou.aliyuncs.com/my-ns}"
PLATFORM="${PLATFORM:-linux/amd64}"   # ACK 节点如果是 ARM（倚天）实例，改成 linux/arm64

IMAGES=(
  "nginx:1.30-alpine"                # 08 hello-nginx、14 Magento web
  "postgres:17-alpine"               # 13 shop-api 数据库
  "mysql:8.4"                        # 14 Magento 数据库
  "opensearchproject/opensearch:3"   # 14 Magento 搜索
  "valkey/valkey:8.1-alpine"         # 14 Magento 缓存与会话
  "busybox:1.37"                     # 压测、调试
)

for src in "${IMAGES[@]}"; do
  # opensearchproject/opensearch:3 -> opensearch:3
  dst="${REGISTRY}/${src##*/}"
  echo ">>> ${src} -> ${dst}"
  docker pull --platform "${PLATFORM}" "${src}"
  docker tag "${src}" "${dst}"
  docker push "${dst}"
done

echo "完成。把 YAML 里的镜像地址改成 ${REGISTRY}/...，并把登录地址换成 VPC 内网地址（通常带 -vpc）。"
