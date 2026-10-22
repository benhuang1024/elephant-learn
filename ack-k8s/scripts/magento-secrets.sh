#!/usr/bin/env bash
# 为 14 章生成 Magento 用到的所有密钥，并创建两个 Secret：
#   magento-db  ：root-password、password（MySQL）
#   magento-app ：crypt-key、admin-password、env.php
# 只能运行一次：数据库初始化以后，密码和加密密钥都不能再随便换。
#
# 用法：NS=magento HOST=magento.example.test ADMIN_FRONTNAME=admin_k8s ./magento-secrets.sh
set -euo pipefail

NS="${NS:-magento}"
HOST="${HOST:-magento.example.test}"
ADMIN_FRONTNAME="${ADMIN_FRONTNAME:-admin_k8s}"   # 要和 manifests/03-magento/config.yaml 一致
TEMPLATE="$(cd "$(dirname "$0")/.." && pwd)/manifests/03-magento/env.php.template"

if kubectl -n "$NS" get secret magento-db >/dev/null 2>&1; then
  echo "Secret magento-db 已经存在，为了不让密码和数据库对不上，脚本不会覆盖它。" >&2
  echo "确实要重来：先删除 magento 命名空间里的 MySQL 数据（PVC），再删除这两个 Secret。" >&2
  exit 1
fi

# 全部用十六进制字符，避免 sed 和 PHP 字符串里的特殊字符问题
DB_ROOT_PASSWORD="$(openssl rand -hex 16)"
DB_PASSWORD="$(openssl rand -hex 16)"
CRYPT_KEY="$(openssl rand -hex 16)"                # 32 个字符，Magento 要求
ADMIN_PASSWORD="Admin-$(openssl rand -hex 6)"      # 必须同时包含字母和数字
INSTALL_DATE="$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000')"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
sed -e "s|__DB_PASSWORD__|${DB_PASSWORD}|" \
    -e "s|__CRYPT_KEY__|${CRYPT_KEY}|" \
    -e "s|__ADMIN_FRONTNAME__|${ADMIN_FRONTNAME}|" \
    -e "s|__HOST__|${HOST}|" \
    -e "s|__INSTALL_DATE__|${INSTALL_DATE}|" \
    "$TEMPLATE" > "$TMP/env.php"

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" create secret generic magento-db \
  --from-literal=root-password="$DB_ROOT_PASSWORD" \
  --from-literal=password="$DB_PASSWORD"
kubectl -n "$NS" create secret generic magento-app \
  --from-literal=crypt-key="$CRYPT_KEY" \
  --from-literal=admin-password="$ADMIN_PASSWORD" \
  --from-file=env.php="$TMP/env.php"

echo
echo "后台地址：http://${HOST}/${ADMIN_FRONTNAME}"
echo "后台账号：admin（见 config.yaml 的 ADMIN_USER）"
echo "后台密码：kubectl -n ${NS} get secret magento-app -o jsonpath='{.data.admin-password}' | base64 -d"
