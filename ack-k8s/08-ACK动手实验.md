# 08 ACK 动手实验：开一个港口，放第一个网站

> 这一章要真的花钱（按量付费，做完立刻删，一般几元到几十元）。控制台的界面会改版，按钮名字可能和这里写的不完全一样，以实际界面为准。
> 用到的 YAML：[manifests/00-common/](manifests/00-common/)、[manifests/01-hello-nginx/](manifests/01-hello-nginx/)。

## 1. 一句话说清

**在阿里云上真的开一个港口，放 3 个 nginx 托盘，修一扇大门让外面的人能访问，然后看它自愈、扩容、更新，最后把港口拆掉。**

## 2. 港口故事（实验路线图）

```
① 开港口（建集群） → ② 拿到办事证（kubeconfig） → ③ 下订单（Deployment）
→ ④ 设取货窗口（Service） → ⑤ 修大门（LoadBalancer / ALB Ingress）
→ ⑥ 弄坏一个托盘看自愈 → ⑦ 天热了看扩容（HPA） → ⑧ 换新口味（滚动更新与回滚）
→ ⑨ 看监控录像（日志、监控） → ⑩ 拆港口（删除集群与关联资源）
```

## 3. 低年级简化版

我们真的去阿里云开一个港口，放一个小网站进去。然后故意弄坏一个箱子，看它会不会自己好起来。玩完了把港口拆掉，不然会一直花钱。

## 4. 大人要懂的真相：完整步骤

### 第 0 步：准备
- 一个完成实名认证的阿里云账号。按量付费的资源通常要求账户里有一定余额。
- 第一次进入 [容器服务控制台](https://cs.console.aliyun.com/) 时，按提示**开通服务并给默认服务角色授权**。
- 本机装好 `kubectl`（版本和集群相差不超过一个小版本）。也可以不装，直接用控制台里的 **CloudShell / 工作台**来执行 kubectl。
- **地域怎么选**：中国内地地域的节点访问 Docker Hub 经常失败。学习时有两个办法：
  1. 选**中国香港**或海外地域，可以直接拉 Docker Hub 的镜像；
  2. 选内地地域，先用 [scripts/sync-images.sh](scripts/sync-images.sh) 把需要的镜像同步到自己的 ACR，再修改 YAML 里的镜像地址。

### 第 1 步：开港口（创建集群）
控制台 → 集群列表 → 创建集群 → **ACK 托管集群**：

| 配置项 | 学习时的建议 | 为什么 |
|---|---|---|
| 集群规格 | 基础版（免集群管理费），或者 Pro 版 | 基础版最多 10 个节点，学习够用 |
| Kubernetes 版本 | 列表里最新的稳定版本 | 维护期最长 |
| 专有网络 VPC | 自动创建，或选已有的 | — |
| 交换机 | **至少两个可用区**各一个 | ALB 要求至少两个可用区；节点也能分散到多个可用区 |
| 网络插件 | Terway（想练 NetworkPolicy）或 Flannel（更简单） | **建好以后不能改** |
| 配置 SNAT | 勾选 | 节点才能访问公网拉镜像（会创建 NAT 网关和 EIP，会收费） |
| API Server 访问 | 如果要在本机用 kubectl，就勾选“使用 EIP 暴露 API Server” | 不勾选的话只能在 VPC 内或者 CloudShell 里访问。暴露到公网时，记得配置访问控制只放行你的 IP |
| 节点池 | 2 个节点，4 核 8 GB，按量付费；ESSD 系统盘 | 14 章的 Magento 至少需要这么多；只做 08 章的话 2 核 4 GB 也够 |
| 登录方式 | 密钥对 | 比密码安全 |
| 组件配置 | Ingress 选 **ALB Ingress**；开启日志服务和 Prometheus 监控 | 后面的实验要用 |

点击创建，大约 10 分钟后集群状态变成“运行中”。

### 第 2 步：拿到办事证（kubeconfig）

集群详情 → **连接信息** → 复制公网（或内网）访问的 kubeconfig：

```bash
mkdir -p ~/.kube
vim ~/.kube/config          # 粘贴，保存
chmod 600 ~/.kube/config
kubectl get nodes -o wide   # 看到 2 个 Ready 的节点，说明连接成功
kubectl get pods -A         # 看看 ACK 默认装了哪些系统组件
```

kubeconfig 就是你的**港口通行证**，有了它就能操作整个集群。不要提交到 Git，不要发给别人。ACK 支持吊销已经发出去的 kubeconfig。

### 第 3、4 步：下订单，设取货窗口

```bash
cd ack-k8s/manifests/01-hello-nginx
kubectl apply -f deployment.yaml -f service.yaml
kubectl get deploy,rs,pods -l app=hello-nginx -o wide   # 一个 Deployment、一个 ReplicaSet、3 个 Pod
kubectl get svc hello-nginx

# 不对外暴露也能先测：把本机的 8080 端口转发到 Service
kubectl port-forward svc/hello-nginx 8080:80
curl http://127.0.0.1:8080        # 另开一个终端执行
```

### 第 5 步：修大门

**方式 A：LoadBalancer（四层，简单直接）**

```bash
kubectl apply -f service-lb.yaml
kubectl get svc hello-nginx-lb -w     # 等 EXTERNAL-IP 出现
curl http://<EXTERNAL-IP>/
```

在“负载均衡”控制台可以看到 ACK 自动创建的实例。**看完就删**：`kubectl delete -f service-lb.yaml`（实例会一起被释放）。

**方式 B：ALB Ingress（七层，推荐，后面 13、14 章都用它）**

1. 确认组件已安装：集群 → 组件管理 → 网络 → **ALB Ingress Controller**。
2. 编辑 [manifests/00-common/alb-config.yaml](manifests/00-common/alb-config.yaml)，把两个 `vSwitchId` 换成集群 VPC 里两个不同可用区的交换机 ID（这两个可用区都要支持 ALB，参考 [创建并使用 ALB Ingress](https://help.aliyun.com/zh/ack/ack-managed-and-ack-dedicated/user-guide/create-and-use-alb-ingress-to-expose-services-to-the-public)）。

```bash
kubectl apply -f ../00-common/alb-config.yaml
kubectl get albconfig alb-demo          # 等待 ALB 实例创建好
kubectl apply -f ingress.yaml
kubectl get ingress hello-nginx         # ADDRESS 一栏是 ALB 的域名
curl http://<ALB 域名>/
```

> 为什么推荐 ALB Ingress？它是全托管的，不用自己运维 Nginx Ingress Controller 的 Pod；改配置时热更新，长连接不会因为 Nginx reload 而闪断；按量计费，有自动弹性。对照见 [Nginx Ingress、ALB Ingress 和 MSE Ingress 对比](https://help.aliyun.com/zh/ack/ack-managed-and-ack-dedicated/user-guide/comparison-among-nginx-ingresses-alb-ingresses-and-mse-ingresses-1)。

### 第 6 步：弄坏一个托盘，看自愈

```bash
kubectl get pods -l app=hello-nginx -w           # 终端 1：一直看着
kubectl delete pod <其中一个 Pod 的名字>            # 终端 2：删掉一个
```

你会看到旧 Pod 变成 Terminating，几乎同时出现一个新 Pod，从 ContainerCreating 变成 Running。整个过程中 `curl` ALB 的地址不受影响。

**进阶**：把一个节点设置为不可调度，然后排空（drain），观察 Pod 被赶到另一个节点上：

```bash
kubectl cordon <节点名>
kubectl drain <节点名> --ignore-daemonsets --delete-emptydir-data
kubectl get pods -o wide -l app=hello-nginx
kubectl uncordon <节点名>
```

### 第 7 步：天热了，看扩容

```bash
kubectl apply -f hpa.yaml
kubectl get hpa hello-nginx -w                    # 终端 1

# 终端 2：开一个压测托盘，不停地访问 hello-nginx
kubectl run load --rm -it --image=busybox:1.37 --restart=Never -- \
  sh -c 'while true; do wget -q -O /dev/null http://hello-nginx; done'
```

一两分钟后，TARGETS 超过 50%，REPLICAS 会逐渐增加。停止压测（Ctrl+C），大约 5 分钟后（缩容有稳定窗口）副本会缩回最小值 2。

### 第 8 步：换新口味，再换回来

```bash
kubectl set image deployment/hello-nginx nginx=nginx:1.30.6-alpine
kubectl rollout status deployment/hello-nginx
kubectl rollout history deployment/hello-nginx

# 故意换一个不存在的镜像，模拟发布失败
kubectl set image deployment/hello-nginx nginx=nginx:does-not-exist
kubectl get pods -l app=hello-nginx      # 新 Pod 卡在 ImagePullBackOff，旧 Pod 还在服务（maxUnavailable: 0 的作用）
kubectl rollout undo deployment/hello-nginx
```

### 第 9 步：看监控录像

```bash
kubectl logs deploy/hello-nginx --tail=20         # 某个 Pod 的日志
kubectl logs -l app=hello-nginx --prefix --tail=5 # 所有副本的日志
kubectl top pods                                   # CPU、内存用量（依赖 metrics-server）
kubectl describe pod <名字>                         # 最下面的 Events 是排障第一现场
```

控制台里还可以看：集群 → 运维管理 → **日志中心**（SLS）和 **Prometheus 监控**（内置了很多大盘）。

### 第 10 步：拆港口（一定要做）

```bash
kubectl delete -f ingress.yaml -f hpa.yaml -f service.yaml -f deployment.yaml
kubectl delete -f ../00-common/alb-config.yaml    # 会释放 ALB 实例
```

如果接下来要做 13、14 章，可以先保留集群；否则就在控制台删除集群，**勾选同时删除关联的负载均衡、NAT 网关、云盘等资源**。删完以后到下面这些控制台各检查一遍：ECS、负载均衡（CLB/NLB/ALB）、NAT 网关、弹性公网 IP、云盘、日志服务。

### 常见问题排查

| 现象 | 先看 | 常见原因 |
|---|---|---|
| Pod 一直 Pending | `kubectl describe pod` 的 Events | 节点资源不够；PVC 绑定不上；节点有污点 |
| ImagePullBackOff / ErrImagePull | Events 里的错误信息 | 镜像名或 tag 写错；拉不到 Docker Hub；私有仓库没配凭证 |
| CrashLoopBackOff | `kubectl logs <pod> --previous` | 应用启动报错；配置或环境变量缺失；liveness 探针太严格 |
| Service 访问不通 | `kubectl get endpointslices -l kubernetes.io/service-name=<svc>` | selector 和 Pod 标签对不上；Pod 没有 Ready |
| Ingress 没有 ADDRESS | `kubectl describe ingress`；`kubectl get albconfig` | 没装 ALB Ingress Controller；vSwitch 写错；`ingressClassName` 写错 |

## 5. 类比在哪里不成立

- 故事里“拆港口”很干脆，现实中**删除集群并不一定会删掉所有相关资源**，一定要手动检查。
- `port-forward` 并不是真的修了一条路，它只是在你的电脑和集群之间临时拉了一根管子，关掉终端就没了。

## 6. 课堂小活动：给孩子看真实的港口（10 分钟，老师操作）

把投屏切到终端，老师执行第 6 步。让孩子盯着屏幕喊出每个状态：“Terminating——它坏了！”“ContainerCreating——新的在装箱！”“Running——好了！”。然后执行第 7 步，让孩子数 REPLICAS 从 2 变成几。

## 7. 孩子可能会问

- **问：为什么要拆掉？留着不行吗？**
  答：港口的场地是按小时收钱的，不拆就一直扣钱，就像租了铺位不退。
- **问：那个很长的网址（ALB 域名）是什么？**
  答：那是港口大门的地址。正式的网站会给大门起一个好记的名字，比如 `www.xxx.com`，这一步叫“域名解析”。

## 8. 自测题

1. kubeconfig 是什么？为什么不能泄露？
2. `type: LoadBalancer` 和 ALB Ingress 都能对外暴露服务，区别是什么？
3. 发布了一个错误的镜像，为什么线上没有出问题？怎么回滚？
4. HPA 停止压测后，为什么要等几分钟才缩容？
5. 删除集群后，还要检查哪几个控制台？

<details>
<summary>参考答案</summary>

1. 访问集群 apiserver 的凭证，包含地址和身份证书。拿到它就能以对应身份操作集群。
2. LoadBalancer 是四层（TCP/UDP），每个 Service 一个负载均衡实例；ALB Ingress 是七层（HTTP/HTTPS），可以按域名和路径把流量分给多个 Service，共用一个 ALB。
3. `maxUnavailable: 0`，新 Pod 不 Ready 时旧 Pod 不会被删掉。用 `kubectl rollout undo` 回滚。
4. HPA 缩容有稳定窗口（默认 5 分钟），防止流量抖动导致副本数来回变化。
5. ECS、负载均衡、NAT 网关、弹性公网 IP、云盘（和快照）、日志服务。
</details>
