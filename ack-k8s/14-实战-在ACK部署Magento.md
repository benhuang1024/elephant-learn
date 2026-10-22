# 14 实战：在 ACK 部署 Magento

> 部署对象：**Magento Open Source 2.4.8-p5**（nginx + php-fpm + MySQL + OpenSearch + Valkey）。
> 用到的文件：镜像构建 [docker/magento/](docker/magento/)，K8s 清单 [manifests/03-magento/](manifests/03-magento/)，密钥脚本 [scripts/magento-secrets.sh](scripts/magento-secrets.sh)。
> 前提：做完 [08 章](08-ACK动手实验.md)（集群、kubectl、[ALB 大门](manifests/00-common/alb-config.yaml)）；本机有 Docker；集群至少有 2 个 4 核 8 GB 的节点。
> 版本事实核对于 2026-10，来源是 [Adobe 官方系统需求](https://experienceleague.adobe.com/en/docs/commerce-operations/installation-guide/system-requirements)。

## 1. 一句话说清

**把 Magento 拆成“前台收银（nginx）+ 后厨（php-fpm）”两个容器放在同一个托盘上，数据库、搜索、缓存各占一个托盘，商品图片放进所有托盘都能进的共享仓库（NAS），再雇一个夜班员工（cron）和一个只上一次班的开业工人（安装 Job）。**

## 2. 港口故事（给孩子的版本，可选）

> 港口里要开一家**大超市**（Magento），比上一章的小卖部复杂多了：
> - 每个柜台有两个人搭档：**收银员**（nginx）站在前面接待顾客，遇到要算账的事就转身交给身后的**厨师**（php-fpm）。两个人站在同一个托盘上，说话最快。
> - 超市的**账本仓库**（MySQL）记着所有商品和订单；**找货台**（OpenSearch）帮顾客搜索商品；**便利贴墙**（Valkey）贴着常用的答案，不用每次都翻账本。
> - 商品照片放在**共享货架**（NAS）上，所有柜台都能拿到同一张照片。
> - **开业工人**（安装 Job）只在开业那天干一次活：布置货架、登记账本。以后每次装修（升级），再请他来一次。
> - **夜班员工**（cron）每分钟巡视一圈：更新价格、发邮件、整理索引。
> - 柜台员工上班前要先问一句：“开业工人干完活了吗？”没干完就在门口等着（initContainer）。

## 3. 版本与架构

### 3.1 版本组合

Adobe 只支持系统需求表里列出的版本组合。本章选 2.4.8-p5：

| 组件 | 2.4.8-p5（本章） | 2.4.9（2026-05 发布） | 本章使用的镜像 |
|---|---|---|---|
| PHP | 8.4、8.3 | 8.5 | `php:8.4-fpm` |
| Composer | 2.10 | 2.10 | `composer:2.10` |
| MySQL / MariaDB | MySQL 8.4；MariaDB 11.4、11.8 | MySQL 8.4；MariaDB 12.3 | `mysql:8.4` |
| OpenSearch | 3 | 3 | `opensearchproject/opensearch:3` |
| Valkey | 8.1 | 9 | `valkey/valkey:8.1-alpine` |
| nginx | 1.30 | 1.30 | `nginx:1.30-alpine` |
| RabbitMQ / Varnish | 4.3 / 8（可选） | 4.3 / 8（可选） | 本章不用 |

想直接用 2.4.9：把 Dockerfile 的 `PHP_VERSION` 改成 8.5、引导时的版本号改成 2.4.9、Valkey 换成 9，再对照官方表核对一遍。选 2.4.8-p5 的原因是 2.4.9 要求 PHP 8.5，很多第三方扩展还没跟上。

**composer 源怎么选**：
- 学习时用 [Mage-OS 镜像源](https://mirror.mage-os.org/)（`https://mirror.mage-os.org/`）。它是社区维护的 Magento Open Source 包镜像，不需要密钥，国内访问也比较快。
- 生产环境、或者用 Adobe Commerce（商业版）时，用官方源 `https://repo.magento.com/`。要先在 Commerce Marketplace 申请 Access Keys，构建时通过 BuildKit secret 传给 composer（Dockerfile 里已经预留好了）。

### 3.2 架构图

```
 浏览器  Host: magento.example.test
   │
   ▼
 ALB ── Ingress magento（/）──► Service magento:80
                                   │
            ┌──────────────────────┴──────────────────────┐
            ▼                                             ▼
   Pod magento（2–6 个，HPA）                       Pod magento ...
   ┌───────────────────────────────────────┐
   │ initContainer wait-for-db               │ 等 setup:db:status 通过
   │ nginx:8080（magento-web 镜像，带 pub/）   │
   │     │ fastcgi 127.0.0.1:9000           │
   │ php-fpm:9000（magento-php 镜像）         │ app/etc/env.php ← Secret magento-app（只读）
   │ var/ → emptyDir（每个 Pod 自己一份）       │
   └───────────────────────────────────────┘
        │             │               │              │
        ▼             ▼               ▼              ▼
   mysql:3306    opensearch:9200   valkey:6379    PVC magento-media（NAS，RWX）
   StatefulSet   StatefulSet       Deployment     挂到每个 Pod 的 pub/media
   + 云盘 20Gi    + 云盘 20Gi        db0 缓存、db1 整页缓存、db2 会话

   Deployment magento-cron（1 个，Recreate）：while true; bin/magento cron:run; sleep 60
   Job magento-setup：首次执行 setup:install，以后每次发布执行 setup:upgrade --keep-generated
```

### 3.3 为什么这样设计（和传统 VM 部署对照）

| 问题 | 传统 VM 部署 | 本章的做法 | 原因 |
|---|---|---|---|
| 代码怎么发布 | 在服务器上 `git pull`，然后跑 composer、`di:compile`、`static-content:deploy`，再切软链 | **构建镜像时**就完成 composer install、`di:compile`、静态文件部署；镜像是不可变的 | 每个副本完全一致，Pod 启动快；可以放心设置 `opcache.validate_timestamps=0` |
| nginx 和 php-fpm | 装在同一台机器上 | 同一个 Pod 里的两个容器，通过 `127.0.0.1:9000` 通信 | 共享网络，一起扩缩容；nginx 镜像只带 `pub/` 目录，很小 |
| `app/etc/env.php` | 在服务器上手工维护 | Secret 用 `subPath` 只读挂载 | 数据库密码和加密密钥不进镜像，也不进 Git |
| 安装和升级 | 登录服务器执行 `bin/magento` | **Job**：第一次执行 `setup:install`，以后执行 `setup:upgrade --keep-generated` | 能重复执行，有日志可查；新 Pod 用 initContainer 等到数据库结构是最新的才启动 |
| cron | 系统 crontab | **常驻 Deployment**，1 个副本，发布策略 Recreate | `cron:run` 会把任务组放到后台子进程里跑；用 K8s CronJob 的话，主进程一退出容器就结束，后台任务会被一起杀掉 |
| `pub/media` | 本机磁盘 | **NAS（ReadWriteMany）**，所有 Pod 共享 | 后台上传的图片，所有副本都要读到 |
| `var/` | 本机磁盘 | 每个 Pod 一个 emptyDir | 日志、报告、锁文件都是 Pod 自己的；**注意维护模式标记也在 `var/` 里**（见第 8 步） |
| 会话和缓存 | 文件 | Valkey | 多个副本共享登录状态；执行一次 `cache:flush` 对所有副本都生效 |
| 静态文件 | 首次访问时生成，或者在服务器上部署 | 构建时生成，打进 nginx 镜像 | 生产模式不允许运行时生成；php 和 web 两个镜像必须来自同一次构建 |

## 4. 步骤

### 第 1 步：本地引导（只做一次，大约 20 分钟）

构建镜像需要三个文件：`composer.json`、`composer.lock`，以及带有 scopes 和 themes 的 `app/etc/config.php`。有了 config.php，构建时执行 `di:compile` 和静态文件部署就**不需要连数据库**。而要导出 scopes 和 themes，必须先完整安装一次，所以先在本地用 Docker Compose 装一遍：

```bash
cd ack-k8s/docker/magento/bootstrap
docker compose up -d mysql opensearch

# 1) 创建项目（Mage-OS 镜像源，不需要密钥）
docker compose run --rm php composer create-project \
  --repository-url=https://mirror.mage-os.org/ \
  magento/project-community-edition:2.4.8-p5 .

# 2) 本地安装（只是为了导出配置，参数随便填）
docker compose run --rm php php -d memory_limit=-1 bin/magento setup:install \
  --base-url=http://localhost/ \
  --db-host=mysql --db-name=magento --db-user=magento --db-password=magento \
  --admin-firstname=Admin --admin-lastname=Local --admin-email=admin@example.com \
  --admin-user=admin --admin-password='Admin12345' \
  --language=en_US --currency=CNY --timezone=Asia/Shanghai --use-rewrites=1 \
  --search-engine=opensearch --opensearch-host=opensearch --opensearch-port=9200

# 3) 仅限实验环境：关闭后台双因素认证，否则登录后台要先配置 2FA
docker compose run --rm php php bin/magento module:disable \
  Magento_AdminAdobeImsTwoFactorAuth Magento_TwoFactorAuth

# 4) 把 scopes、themes、语言设置导出到 config.php
docker compose run --rm php php bin/magento app:config:dump scopes themes i18n

# 5) 取出三个文件，然后把本地环境全部删掉
mkdir -p ../project/app/etc
cp src/composer.json src/composer.lock ../project/
cp src/app/etc/config.php ../project/app/etc/
cp src/app/etc/env.php ./env.php.reference     # 只用来对照 env.php.template，已在 .gitignore 里
docker compose down -v
sudo rm -rf src                                  # Linux 上 src 属于 root
```

`project/` 里的三个文件要提交到 Git，它们就是这个 Magento 项目的“设计图”。以后要加模块：在 `project/` 上执行 `composer require`（更新 lock 文件），再执行 `bin/magento module:enable 模块名`（更新 config.php），这两步都不需要数据库。

### 第 2 步：构建并推送两个镜像

```bash
cd ack-k8s/docker/magento
export REGISTRY=registry.cn-hangzhou.aliyuncs.com/elephant    # 换成你的 ACR 公网地址和命名空间
export TAG=1.0.0

docker buildx build --platform linux/amd64 --target php -t $REGISTRY/magento-php:$TAG --push .
docker buildx build --platform linux/amd64 --target web -t $REGISTRY/magento-web:$TAG --push .
```

- 第二条命令会命中第一条的构建缓存，`build` 阶段不会重新执行，所以两个镜像里的 `pub/static` 是同一份。**清过缓存的话，两个镜像都要重新构建**，否则 nginx 里的静态文件和 PHP 渲染出来的页面可能对不上。
- php 镜像大约 1–2 GB（vendor、generated、pub/static），第一次推送比较慢。
- 用官方源 repo.magento.com 时，加上 `--secret id=composer_auth,src=$HOME/.composer/auth.json`。
- 中国内地地域的集群：用 [scripts/sync-images.sh](scripts/sync-images.sh) 把 mysql、opensearch、valkey 也同步到 ACR，然后打开 kustomization.yaml 里对应的 `images` 配置。

### 第 3 步：检查集群

```bash
# 节点资源：本章所有 Pod 的 requests 加起来大约 3 核 CPU、5.5 GiB 内存
kubectl describe nodes | grep -A 8 "Allocated resources"

# 存储：需要一个支持 ReadWriteMany 的 NAS StorageClass
kubectl get storageclass
```

- 如果有 `alibabacloud-cnfs-nas`，直接用。
- 如果没有：按 [使用 NAS 动态存储卷](https://www.alibabacloud.com/help/zh/ack/ack-managed-and-ack-dedicated/user-guide/mount-a-dynamically-provisioned-nas-volume) 创建一个 NAS StorageClass，然后修改 [media-pvc.yaml](manifests/03-magento/media-pvc.yaml) 里的 `storageClassName`。
- 只想先跑通单副本：把 media-pvc.yaml 改成云盘（`ReadWriteOnce`、`alicloud-disk-topology-alltype`），把 magento 的 `replicas` 改成 1，并从 kustomization.yaml 里去掉 hpa.yaml。注意云盘同一时间只能挂给一个节点，cron 和 Job 会因此调度不上，或者只能和 Web Pod 挤在同一个节点上。

### 第 4 步：生成密钥

```bash
HOST=magento.example.test ADMIN_FRONTNAME=admin_k8s ./ack-k8s/scripts/magento-secrets.sh
```

脚本会创建 `magento` 命名空间和两个 Secret：

| Secret | 键 | 谁用 |
|---|---|---|
| `magento-db` | `root-password`、`password` | MySQL、安装 Job |
| `magento-app` | `crypt-key`、`admin-password` | 安装 Job（`--key`、管理员密码） |
| `magento-app` | `env.php` | Web 和 cron 的 Pod（只读挂载到 `app/etc/env.php`） |

`env.php` 由 [env.php.template](manifests/03-magento/env.php.template) 渲染得到，里面的数据库密码、`crypt.key` 和 Job 用的是同一份。**加密密钥一旦用于安装就不能再换**，否则已经加密存进数据库的数据（比如支付配置）会解不开，所以脚本发现 Secret 已经存在时会拒绝覆盖。

再创建拉取 ACR 镜像的凭证（装了免密组件的话可以跳过，并删掉 YAML 里的 `imagePullSecrets`）：

```bash
kubectl -n magento create secret docker-registry acr-cred \
  --docker-server=registry-vpc.cn-hangzhou.aliyuncs.com \
  --docker-username=<ACR 用户名> --docker-password=<ACR 登录密码>
```

### 第 5 步：部署

编辑 [kustomization.yaml](manifests/03-magento/kustomization.yaml)，把两个 `newName` 换成你的 ACR **VPC 地址**，`newTag` 换成第 2 步的 `$TAG`，然后：

```bash
kubectl apply -k ack-k8s/manifests/03-magento
kubectl -n magento get pods -w
```

按时间顺序，你会看到：

1. `mysql-0`、`opensearch-0`、`valkey-xxx` 依次 Ready（OpenSearch 大约要 1 分钟）。
2. `magento-setup-xxx`（Job）开始执行。看日志：

   ```bash
   kubectl -n magento logs -f job/magento-setup
   ```

   先输出“等待 MySQL”“等待 OpenSearch”，然后是 `setup:install` 的进度（建表、写入数据、建索引），一般需要 5–15 分钟，最后输出“完成”。
3. 在这段时间里，`magento-xxx` 和 `magento-cron-xxx` 一直停在 `Init:0/1`：initContainer `wait-for-db` 每 10 秒执行一次 `setup:db:status`，直到返回 0（数据库结构是最新的）。
4. Job 完成后，Web Pod 变成 `2/2 Running`（nginx 和 php-fpm 两个容器都 Ready），cron Pod 变成 `1/1 Running`。

```bash
kubectl -n magento get pods,pvc,ingress
kubectl -n magento logs deploy/magento -c wait-for-db | tail -3   # 看看它等了多久
```

### 第 6 步：访问前台和后台

```bash
ALB=$(kubectl -n magento get ingress magento -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: magento.example.test' http://$ALB/    # 期望 200
nslookup $ALB                                                                           # 记下一个 IP
```

把 `<IP> magento.example.test` 写进本机的 hosts 文件（Linux/macOS 是 `/etc/hosts`；在 WSL 里用的是 Windows 浏览器的话，要改 `C:\Windows\System32\drivers\etc\hosts`）。然后：

- 前台：<http://magento.example.test/>，能看到 Luma 主题的首页（还没有商品）。
- 后台：<http://magento.example.test/admin_k8s>，账号 `admin`，密码用下面的命令查看：

```bash
kubectl -n magento get secret magento-app -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

> ALB 的 IP 可能会变。正式环境应该用自己的域名，CNAME 到 ALB 的域名上，并且 `BASE_URL` 用这个域名。

### 第 7 步：验证 K8s 带来的能力

**1）自愈：删掉一个 Web Pod，网站不受影响**

```bash
kubectl -n magento delete $(kubectl -n magento get pods -l app=magento -o name | head -1) --wait=false
while true; do curl -s -o /dev/null -w '%{http_code} ' -H 'Host: magento.example.test' http://$ALB/; sleep 1; done
```

**2）共享图片：在后台上传，在所有副本上都能看到**

在后台进入 Catalog → Products → Add Product，上传一张图片并保存。然后：

```bash
for p in $(kubectl -n magento get pods -l app=magento -o name); do
  echo "== $p"; kubectl -n magento exec $p -c php-fpm -- ls pub/media/catalog/product | head -3
done
```

每个 Pod 都能看到同样的目录，因为它们挂的是同一个 NAS。

**3）共享会话：删掉 Pod，后台不用重新登录**

保持后台登录，删掉所有 Web Pod（`kubectl -n magento delete pod -l app=magento`）。等新 Pod Ready 后刷新后台，仍然是登录状态，因为会话存在 Valkey 里，而不是 Pod 的本地文件里。

**4）cron 在工作**

```bash
kubectl -n magento exec mysql-0 -- sh -c \
  'mysql -umagento -p"$MYSQL_PASSWORD" magento -e "SELECT job_code,status,executed_at FROM cron_schedule ORDER BY schedule_id DESC LIMIT 5"'
kubectl -n magento exec deploy/magento-cron -- php bin/magento indexer:status
```

**5）一次清空所有副本的缓存**

```bash
kubectl -n magento exec deploy/magento -c php-fpm -- php bin/magento cache:flush
```

### 第 8 步：发布新版本

以升级到新的补丁版本或者新增一个模块为例：

```bash
# 1. 更新 project/ 里的 composer.json / composer.lock（/ config.php），然后用新 tag 构建两个镜像
export TAG=1.0.1
docker buildx build --platform linux/amd64 --target php -t $REGISTRY/magento-php:$TAG --push ack-k8s/docker/magento
docker buildx build --platform linux/amd64 --target web -t $REGISTRY/magento-web:$TAG --push ack-k8s/docker/magento

# 2. 把 kustomization.yaml 里两个镜像的 newTag 改成 1.0.1

# 3. Job 的模板不能修改，先删掉旧的 Job，再整体 apply
kubectl -n magento delete job magento-setup --ignore-not-found
kubectl apply -k ack-k8s/manifests/03-magento
kubectl -n magento logs -f job/magento-setup        # 这次走的是 setup:upgrade 分支
```

发布过程中：
- 新的 Web Pod 停在 `wait-for-db`，一直等到 Job 把数据库结构升级完成；`maxUnavailable: 0` 保证旧 Pod 在这段时间里继续提供服务。
- cron 是 `Recreate` 策略，旧的先停，新的在 Job 完成后才开始跑。

**一定要知道的坑：维护模式。** `bin/magento maintenance:enable` 只会在**当前 Pod** 的 `var/` 里写一个 `.maintenance.flag`，其他 Pod 完全不受影响。所以在 K8s 里：
- 补丁升级、只改代码的发布，可以像上面这样滚动更新（旧代码会短暂运行在新的数据库结构上，一般没问题）；
- 跨小版本的升级、大的数据迁移，要规划维护窗口：先在 ALB 上把流量切到一个维护页面（或者把 Web 缩到 0），然后跑 Job，最后恢复流量。

### 第 9 步：清理

```bash
kubectl delete -k ack-k8s/manifests/03-magento
```

kustomization 里包含 Namespace，所以整个 `magento` 命名空间都会被删除，包括 Secret 和 StatefulSet 创建的 PVC（云盘会随之释放）。最后到控制台检查：云盘、NAS 文件系统（CNFS 创建的文件系统不会被自动删除）、ACR 里的镜像。

## 5. 常见问题排查

| 现象 | 原因 | 处理 |
|---|---|---|
| Web Pod 一直是 `Init:0/1` | `wait-for-db` 在等：Job 还没跑完，或者失败了 | `kubectl -n magento logs job/magento-setup`；`kubectl -n magento logs <pod> -c wait-for-db` |
| Job 报 `You do not have the SUPER privilege and binary logging is enabled` | MySQL 开着 binlog，Magento 建触发器需要特殊参数 | mysql.yaml 里已经加了 `--log-bin-trust-function-creators=1`；用 RDS 时要修改实例参数 |
| Job 一直卡在“等待 OpenSearch” | OpenSearch 没起来，常见原因是内存不够被 OOMKill | `kubectl -n magento describe pod opensearch-0`；调整 `OPENSEARCH_JAVA_OPTS` 和内存 limit |
| Job 报 `Missing write permissions to the following paths: ... pub/media` | NAS 目录 www-data 写不进去 | 确认 Pod 上有 `fsGroup: 33`；检查 NAS 的权限组是不是允许读写 |
| 第一次安装中途失败，重跑后进了 `setup:upgrade` 分支，又报错 | 数据库里已经有了一部分表 | 清空数据库后重来：`kubectl -n magento exec mysql-0 -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE magento; CREATE DATABASE magento; GRANT ALL ON magento.* TO magento;"'`，再删掉 Job 重新 apply |
| 页面没有样式，CSS/JS 返回 404 | php 和 web 镜像不是同一次构建出来的；或者静态文件部署时没包含对应的主题和语言 | 两个镜像用同一个 tag 一起重新构建；换语言时 Dockerfile 里的 `en_US` 也要改 |
| 前台提示 `The configuration file has changed` | config.php 里的 scopes/themes 没有导入数据库 | `php bin/magento app:config:import`（安装脚本里已经包含；`setup:upgrade` 会自动执行这一步） |
| 后台登录后马上被踢出来 | 会话没有共享，或者 Valkey 重启后会话丢了 | 检查 env.php 里的 `session` 配置；生产环境给会话用单独的、带持久化的实例 |
| 在后台“缓存管理”里切换缓存开关时报错 | 切换缓存开关要写 env.php，而 env.php 是只读的 Secret | 改 env.php.template 里的 `cache_types`，更新 Secret，然后重启 Pod |
| php-fpm 容器被 OOMKilled | worker 数量乘以每个 worker 的内存超过了 limit | 调小 `pm.max_children`（docker/magento/php/zz-fpm.conf），或者调大内存 limit |
| `/health_check.php` 返回 500，Pod 不 Ready | 连不上 MySQL 或 Valkey | `kubectl -n magento exec <pod> -c php-fpm -- tail -50 var/log/system.log` |

## 6. 上生产前还要改什么

| 学习版 | 生产版 |
|---|---|
| 集群内的 MySQL | **RDS MySQL**（选 Adobe 支持的版本），参数 `log_bin_trust_function_creators=ON`；只需要改 env.php 和 ConfigMap 里的 `DB_HOST` |
| 集群内单节点 OpenSearch | 托管搜索服务（引擎和版本要在 Adobe 的系统需求表里），或者在独立节点池上跑 3 节点集群。注意阿里云的“开放搜索 OpenSearch”是另一款产品 |
| 一个 Valkey 同时放缓存和会话 | **Tair（Redis 兼容）**，会话和缓存分开实例；会话实例不能配置会淘汰数据的策略 |
| 没有 Varnish | 用 Varnish 做整页缓存（Adobe 推荐），或者在 ALB 前面加 CDN |
| 静态文件由 nginx 提供 | 静态文件和 media 走 CDN（必要时把 media 放到 OSS，需要配合扩展） |
| 日志写在 Pod 的 `var/log` 里 | 把日志输出到 stdout，由 SLS 采集；或者加一个 sidecar 去读日志文件 |
| HTTP | AlbConfig 加 443 监听和证书；Magento 开启安全 URL。让 ALB 传递 `X-Forwarded-Proto` 请求头（AlbConfig 监听里设置 `xForwardedForConfig.XForwardedForProtoEnabled: true`，默认是关闭的），Magento 默认用这个请求头判断请求是不是 HTTPS |
| 关闭了后台 2FA | **必须重新开启**（`module:enable` 后重新导出 config.php），后台用单独的域名，并在 ALB 上按 IP 做白名单 |
| `readOnlyRootFilesystem: false` | 改成 `true`（需要写的目录都已经单独挂载了） |
| 所有 Pod 都能访问数据层 | NetworkPolicy：MySQL、OpenSearch、Valkey 只允许 magento、magento-cron、magento-setup 访问（需要 Terway） |
| 手工 `kubectl apply` | CI/CD：构建 → 推送镜像 → 删 Job 并 `apply -k`；或者用 Helm hook、Argo CD 的 PreSync hook 来跑安装/升级 Job |
| 不用 RabbitMQ | 异步任务多的话接入消息队列 RabbitMQ 版，并单独部署 consumer 的 Deployment |
| 没有考虑可用区 | `topologySpreadConstraints` 把 Web Pod 分散到多个可用区；数据层用托管服务的多可用区版本 |

## 7. 自测题

1. 为什么把 nginx 和 php-fpm 放进同一个 Pod，而不是拆成两个 Deployment？各有什么取舍？
2. 为什么 Magento 的 cron 不用 K8s 的 CronJob？
3. env.php 为什么不打进镜像？为什么安装 Job 里不把它直接挂到 `app/etc/`？
4. 发布新版本时，怎么保证新 Pod 不会在数据库升级完成之前接收流量？
5. 为什么 `pub/media` 必须用 NAS，而 `var/` 可以用 emptyDir？
6. 在 K8s 里执行 `bin/magento maintenance:enable`，会发生什么？应该怎么做维护？
7. 构建镜像时为什么不需要数据库？前提条件是什么？

<details>
<summary>参考答案</summary>

1. 同一个 Pod：共享网络，用 127.0.0.1 通信延迟最低；一起调度、一起扩缩容，两个镜像的版本天然一致。代价是不能单独扩缩 nginx 或 php-fpm。拆成两个 Deployment 可以分别扩缩，但两边都需要静态文件和 PHP 入口文件，版本也要分别保持一致，复杂度更高。
2. `cron:run` 会把任务组放到后台子进程里执行，然后主进程退出。CronJob 的容器在主进程退出时就结束，后台子进程会被一起杀掉。所以要用一个常驻进程，每分钟执行一次 `cron:run`。
3. env.php 里有数据库密码和加密密钥，打进镜像的话，任何能拉取镜像的人都能看到，换环境也要重新构建。Job 里第一次安装时，`setup:install` 要自己生成 env.php，如果挂了一个只读的文件就会写入失败；所以先挂到 `/secrets`，升级时再复制过去。
4. Web Pod 的 initContainer 循环执行 `setup:db:status`，只有数据库结构和代码一致（返回 0）才继续启动；再配合 `maxUnavailable: 0`，旧 Pod 会一直服务到新 Pod Ready。
5. `pub/media` 里是上传的图片，所有副本都要读写同一份，需要 ReadWriteMany 的共享存储；`var/` 里是日志、报告、锁这类 Pod 私有的临时文件，Pod 没了就可以丢掉。
6. 只会在执行命令的那个 Pod 的 `var/` 里写一个标记文件，其他 Pod 照常服务。应该在入口层做维护：ALB 返回维护页，或者把 Web 缩到 0，再执行升级 Job。
7. 因为 `setup:di:compile` 和 `setup:static-content:deploy` 都属于 setup 命令，Magento 没安装时也能执行。前提是 `app/etc/config.php` 里有模块列表，以及用 `app:config:dump scopes themes` 导出的 scopes 和 themes，这就是第 1 步要先在本地完整安装一次的原因。
</details>
