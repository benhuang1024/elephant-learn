# 13 实战：在 ACK 部署 Spring Boot（shop-api）

> 部署对象：仓库里现成的 [java/code/shop-api](../java/code/shop-api/)（Java 25 + Spring Boot 4.1，商品和订单 API，PostgreSQL + Flyway）。
> 用到的 YAML：[manifests/02-shop-api/](manifests/02-shop-api/)。前提：已经按 [08 章](08-ACK动手实验.md) 建好集群、配好 kubectl，并且创建了 [ALB 大门](manifests/00-common/alb-config.yaml)。

## 1. 一句话说清

**把 shop-api 打成镜像存进 ACR，在 ACK 里放一个 PostgreSQL 仓库和两个 shop-api 托盘，再从 ALB 大门把 `/api` 的流量引过来。**

## 2. 港口故事（给孩子的版本，可选）

> 港口里要开一家“小卖部”（shop-api）。小卖部要一个账本记录卖了什么，这个账本放进一个专门的仓库里（PostgreSQL 数据库，下面挂着一块云盘）。
> 小卖部开了两个柜台（2 个副本），顾客从港口大门进来，看导航牌：“买东西请走 /api”，就到了小卖部的取货窗口。
> 小卖部的钥匙（数据库密码）放在上锁的信封里（Secret），柜台员工上班时才拿出来用。

## 3. 架构

```
 浏览器 / curl
     │  Host: shop.example.test
     ▼
 ALB（AlbConfig alb-demo） ── Ingress shop-api：/api → Service shop-api:80
                                                    │
                                ┌───────────────────┴───────────────────┐
                                ▼                                       ▼
                     Pod shop-api（8080）                     Pod shop-api（8080）
                     探针：/actuator/health/*                  HPA 2–6 个，PDB 至少 1 个
                                └───────────────────┬───────────────────┘
                                                    ▼  jdbc:postgresql://postgres:5432/shop
                                    StatefulSet postgres-0 ── PVC 20Gi 云盘
                                    （生产环境换成 RDS PostgreSQL）
```

| shop-api 已有的能力 | 在 K8s 里怎么用 |
|---|---|
| `application-postgres.yml` 读取 `DB_URL`、`DB_USER`、`DB_PASSWORD` | 用环境变量注入，密码来自 Secret |
| Actuator `/actuator/health/liveness`、`/readiness` | 作为 startup、liveness、readiness 探针 |
| `server.shutdown: graceful` + 20 秒超时 | 配合 `preStop sleep 10` 和 `terminationGracePeriodSeconds: 40` |
| Dockerfile 用 uid 10001 的非 root 用户运行 | `runAsNonRoot` + `readOnlyRootFilesystem`，单独挂一个可写的 `/tmp` |
| `-XX:MaxRAMPercentage=75` | 内存 limit 设为 768Mi，堆大约 576Mi |
| Flyway 启动时自动迁移 | 多个副本同时启动也安全（Flyway 会加锁） |

## 4. 步骤

### 第 1 步：建 ACR 仓库，推送镜像

1. 打开容器镜像服务 ACR 控制台，创建一个**个人版实例**（学习用）或企业版实例，地域和集群一致。
2. 创建命名空间（比如 `elephant`），设置访问凭证（登录密码）。
3. 在本机构建并推送（Apple Silicon 的 Mac 一定要指定 `linux/amd64`，除非你的节点是 ARM 实例）：

```bash
# 在仓库根目录执行
export REGISTRY=registry.cn-hangzhou.aliyuncs.com/elephant     # 换成你的 ACR 公网地址和命名空间
docker login registry.cn-hangzhou.aliyuncs.com

docker buildx build --platform linux/amd64 \
  -t $REGISTRY/shop-api:1.0.0 \
  --push java/code/shop-api
```

> ACR 控制台会显示实例的公网地址和 VPC 地址。**本机推送用公网地址，集群拉取用 VPC 地址**（同一个仓库，两个入口）。
> 中国内地地域的集群如果拉不到 Docker Hub，先用 [scripts/sync-images.sh](scripts/sync-images.sh) 把 `postgres:17-alpine` 也同步到 ACR。

### 第 2 步：创建 Namespace 和 Secret

```bash
kubectl apply -f ack-k8s/manifests/02-shop-api/namespace.yaml

# 数据库账号密码：不写进 YAML、不进 Git
kubectl -n shop create secret generic shop-db \
  --from-literal=username=shop \
  --from-literal=password="$(openssl rand -base64 18)"

# 拉取 ACR 私有镜像的凭证（如果集群安装了 ACR 免密组件 aliyun-acr-credential-helper，可以跳过这一步，并删掉 Deployment 里的 imagePullSecrets）
kubectl -n shop create secret docker-registry acr-cred \
  --docker-server=registry-vpc.cn-hangzhou.aliyuncs.com \
  --docker-username=<ACR 用户名> \
  --docker-password=<ACR 登录密码>
```

### 第 3 步：改镜像地址，一键部署

编辑 [kustomization.yaml](manifests/02-shop-api/kustomization.yaml)，把 `newName` 换成你的 **VPC 地址**，然后：

```bash
kubectl apply -k ack-k8s/manifests/02-shop-api
kubectl -n shop get pods -w
```

你会看到：
1. `postgres-0` 先 Running，然后 Ready（`pg_isready` 通过）。
2. 两个 `shop-api-xxx` 启动。startupProbe 在 JVM 启动和 Flyway 迁移期间保护它们不被误杀，通过以后才开始做 liveness 和 readiness 检查。
3. 两个副本第一次同时启动时，可能**有一个重启一次**：`DemoDataSeeder` 只在表为空时写入演示数据，两个副本同时判断“表是空的”，同时插入，`sku` 唯一约束让后插入的那个启动失败，重启后发现已经有数据，就正常启动了。这正好演示了自愈；生产环境应该把演示数据关掉（环境变量 `SHOP_SEEDDEMODATA=false`，Spring 的宽松绑定会去掉连字符），或者把它也写成 Flyway 迁移。

```bash
kubectl -n shop logs deploy/shop-api | grep -E "Flyway|Started"
kubectl -n shop get pvc                    # data-postgres-0 是 Bound 状态
```

### 第 4 步：验证

```bash
ALB=$(kubectl -n shop get ingress shop-api -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# 公开接口
curl -s -H 'Host: shop.example.test' http://$ALB/api/products | jq .

# 需要登录的接口（演示账号写在 SecurityConfig 里：customer/customer123）
curl -s -u customer:customer123 -H 'Host: shop.example.test' \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"小明","items":[{"productId":1,"quantity":1}]}' \
  http://$ALB/api/orders | jq .

# /actuator 没有暴露在 Ingress 上，从集群内部看
kubectl -n shop port-forward deploy/shop-api 8080:8080
curl -s http://127.0.0.1:8080/actuator/health | jq .
```

想用浏览器访问，可以把 `shop.example.test` 指向 ALB 的 IP（`nslookup $ALB`，写进本机 hosts 文件）。正式环境是给 ALB 域名配一个 CNAME，并在 AlbConfig 里加 HTTPS 监听和证书。

### 第 5 步：做一次不停服发布

修改代码（比如把 `application.yml` 里的 `info.app.version` 改成 1.0.1），然后：

```bash
docker buildx build --platform linux/amd64 -t $REGISTRY/shop-api:1.0.1 --push java/code/shop-api

# 终端 1：持续请求，观察有没有失败
while true; do curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: shop.example.test' http://$ALB/api/products; sleep 0.2; done

# 终端 2：发布
kubectl -n shop set image deployment/shop-api shop-api=registry-vpc.cn-hangzhou.aliyuncs.com/elephant/shop-api:1.0.1
kubectl -n shop rollout status deployment/shop-api
```

终端 1 应该一直是 200。如果中间出现 502/503，依次检查：readiness 探针、preStop 的等待时间、`terminationGracePeriodSeconds`。

> 正式项目不要用 `kubectl set image` 手动发布，应该把 `kustomization.yaml` 里的 `newTag` 改掉、提交到 Git，由 CI/CD（比如云效 Flow、GitHub Actions，或者 ACK One 的 GitOps）去执行 `kubectl apply -k`。

### 第 6 步：压测，看 HPA

```bash
kubectl -n shop get hpa shop-api -w
kubectl -n shop run load --rm -it --image=busybox:1.37 --restart=Never -- \
  sh -c 'while true; do wget -q -O /dev/null http://shop-api/api/products; done'
```

### 第 7 步：数据还在吗？

```bash
kubectl -n shop delete pod postgres-0          # 删掉数据库的托盘
kubectl -n shop get pods -w                    # StatefulSet 会重建一个同名的 postgres-0，挂回同一块云盘
curl -s -H 'Host: shop.example.test' http://$ALB/api/orders -u customer:customer123 | jq .   # 刚才下的订单还在
```

### 第 8 步：清理

```bash
kubectl delete -k ack-k8s/manifests/02-shop-api
kubectl -n shop get pvc     # StatefulSet 的 PVC 不会自动删除，要手动删（会连同云盘一起释放）
kubectl delete namespace shop
```

## 5. 上生产前还要改什么

| 学习版 | 生产版 | 原因 |
|---|---|---|
| 集群内 PostgreSQL StatefulSet | **RDS PostgreSQL**（高可用版），改 `DB_URL` 就行 | 备份、主备切换、监控、版本升级都托管了 |
| `kubectl create secret` | KMS 凭据管家 + ack-secret-manager，或外部密钥同步 | 密码可以轮换，不出现在命令历史里 |
| 内存里的演示账号 | OAuth2 Resource Server（JWT） | 见 [java/docs/09-安全.md](../java/docs/09-安全.md) |
| HTTP | AlbConfig 加 443 监听 + 证书，80 跳转 443 | — |
| `kubectl apply` | Git + CI/CD 或 GitOps | 可审计、可回滚 |
| 默认日志 | JSON 日志 + SLS 采集，Prometheus 抓 `/actuator/prometheus` | 见 [java/docs/10-生产化.md](../java/docs/10-生产化.md) |
| 所有 Pod 都能访问数据库 | 打开 [networkpolicy.yaml](manifests/02-shop-api/networkpolicy.yaml)（需要 Terway） | 最小网络暴露面 |
| 副本可能在同一节点 | 加 `topologySpreadConstraints`，按可用区和节点打散 | 一个节点或一个可用区坏了，服务还在 |

## 6. 自测题

1. 为什么 shop-api 需要 startupProbe，而不是直接把 livenessProbe 的 `initialDelaySeconds` 调大？
2. `terminationGracePeriodSeconds` 为什么设成 40？它和哪两个时间相关？
3. 根文件系统设成只读以后，为什么还要挂一个 `/tmp`？
4. 删除 `postgres-0` 后数据为什么还在？如果删的是 PVC 呢？
5. 想把数据库换成 RDS，需要改哪几个地方？

<details>
<summary>参考答案</summary>

1. startupProbe 只在启动阶段生效，通过后才开始做 liveness 检查。这样既给慢启动留足时间，启动完成后 liveness 又能保持灵敏；只调大 initialDelaySeconds 的话，启动时间不稳定时要么等不够，要么运行期间发现故障太慢。
2. 要大于 preStop 的 10 秒加上 Spring 优雅停机的 20 秒（`timeout-per-shutdown-phase`），再留一点余量。超过这个时间，kubelet 会直接 SIGKILL。
3. 内嵌 Tomcat 和 JVM 需要往临时目录写文件，只读根文件系统下需要用 emptyDir 提供一个可写目录。
4. StatefulSet 重建的 Pod 叫同一个名字（postgres-0），会挂回同一个 PVC，也就是同一块云盘。删掉 PVC 的话，按 ACK 默认的 `reclaimPolicy: Delete`，云盘和数据会一起被删除。
5. 把 `DB_URL` 改成 RDS 的内网地址，把 Secret 里的账号密码换成 RDS 的；从 kustomization 里去掉 postgres.yaml；在 RDS 白名单里加入集群的 VPC 或 Pod 网段（Terway 时 Pod 用的是 VPC 地址）。
</details>
