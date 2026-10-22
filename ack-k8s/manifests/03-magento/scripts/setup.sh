#!/bin/sh
# magento-setup Job 的入口脚本：首次安装，或者升级数据库结构
set -eu
cd /var/www/html

echo ">>> 等待 MySQL"
while true; do
  set +e
  php /scripts/is-installed.php
  rc=$?
  set -e
  [ "$rc" -ne 2 ] && break
  sleep 5
done

echo ">>> 等待 OpenSearch"
until curl -fsS "http://opensearch:9200/_cluster/health?wait_for_status=yellow&timeout=5s" >/dev/null; do
  sleep 5
done

if [ "$rc" -eq 0 ]; then
  echo ">>> 已安装，执行 setup:upgrade"
  cp /secrets/env.php app/etc/env.php
  php -d memory_limit=-1 bin/magento setup:upgrade --keep-generated
else
  echo ">>> 首次安装"
  # --key 必须和 Secret 里 env.php 的 crypt.key 相同，Web 和 cron 的 Pod 用的是 Secret 里的 env.php
  php -d memory_limit=-1 bin/magento setup:install \
    --base-url="$BASE_URL" \
    --backend-frontname="$ADMIN_FRONTNAME" \
    --key="$CRYPT_KEY" \
    --db-host="$DB_HOST" --db-name="$DB_NAME" --db-user="$DB_USER" --db-password="$DB_PASSWORD" \
    --admin-firstname=Admin --admin-lastname=K8s \
    --admin-email="$ADMIN_EMAIL" --admin-user="$ADMIN_USER" --admin-password="$ADMIN_PASSWORD" \
    --language="$LANGUAGE" --currency="$CURRENCY" --timezone="$TIMEZONE" \
    --use-rewrites=1 \
    --search-engine=opensearch --opensearch-host=opensearch --opensearch-port=9200 \
    --cache-backend=redis --cache-backend-redis-server=valkey --cache-backend-redis-db=0 \
    --page-cache=redis --page-cache-redis-server=valkey --page-cache-redis-db=1 \
    --session-save=redis --session-save-redis-host=valkey --session-save-redis-db=2
  # config.php 里带着引导时导出的 scopes/themes，导入数据库，否则前台会提示配置文件已变更
  php bin/magento app:config:import
fi

php bin/magento cache:flush
echo ">>> 完成"
