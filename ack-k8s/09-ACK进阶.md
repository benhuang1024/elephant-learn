# 09 ACK 进阶

> 这一章主要是给你自己看的，课堂上一般讲不到。每一节都附了官方文档链接，功能细节以文档为准。

## 1. 一句话说清

**港口开起来以后，还要学会：修更好的路（网络插件）、临时借场地（虚拟节点）、自动租退场地（节点弹性）、发通行证（权限）、省钱（成本）。**

## 2. 港口故事

> 港口生意越来越好，管理员遇到了新问题：
>
> - **双十一那天**，订单一下子多了 10 倍。租新场地要半小时才能盖好，来不及！于是港口和阿里云约好：“忙不过来的时候，先把托盘放到**虚拟场地**上，按分钟付钱，用完就还。”
> - **平时**，港口自己会看：场地快满了就多租一块（**节点自动伸缩**）；场地空了好久就退掉一块。
> - **人越来越多**，不能谁都能进调度中心。港口给每个人发了不同的**通行证**：有的人只能看，有的人能下订单，只有港长能改规矩。
> - **月底算账**，港长发现很多场地白天都空着一大半。于是他学会了租**便宜的临时场地**（抢占式实例），还给每个片区算清楚各自花了多少钱。

## 3. 低年级简化版

- 很忙的时候，可以临时借场地，用完就还。
- 每个人的通行证不一样，能做的事也不一样。
- 要算清楚花了多少钱，不浪费。

## 4. 大人要懂的真相

### 4.1 网络插件深入：Terway 的几种模式
- **共享 ENI 模式**：多个 Pod 共享一块弹性网卡，各自用网卡上的辅助 IP，Pod 密度高。只有这个模式支持网络加速（DataPathv2 / IPvlan+eBPF）。
- **独占 ENI 模式**：每个 Pod 独占一块弹性网卡，性能最好，但每个节点能挂的网卡数量有限，Pod 密度低。
- **规划要点**：Pod 用的是 VPC 地址，所以要给 Pod 单独规划足够大的 vSwitch 网段（比如 /19），否则扩容时会遇到“IP 不够”。
- 对比文档：[Terway 与 Flannel 对比](https://www.alibabacloud.com/help/tc/ack/ack-managed-and-ack-dedicated/user-guide/comparison-between-terway-and-flannel)

### 4.2 虚拟节点：ECI 与 ACS 算力
- 安装 **ACK Virtual Node** 组件后，集群里会出现一个“虚拟节点”。调度到它上面的 Pod 不占用你的 ECS，而是运行在 Serverless 容器算力（ECI 或 ACS）上，按 Pod 的 CPU、内存和运行时长计费。
- 使用 ACS 算力时，在 Pod 上加标签 `alibabacloud.com/acs: "true"`；也可以通过 ResourcePolicy 或调度策略设置“ECS 优先，资源不够时再用 ECI/ACS”。
- 适合：突发流量、CI 构建任务、批处理、AI 推理。
- 不适合：需要 DaemonSet、依赖宿主机特性（hostPath、特权容器）的负载。
- 文档：[在 ACK 集群中使用 ACS 算力](https://help.aliyun.com/zh/cs/user-guide/access-acs-computing-power-in-an-ack-cluster)、[配置 ECI 弹性](https://help.aliyun.com/zh/ack/ack-managed-and-ack-dedicated/user-guide/configure-eci-scaling)

### 4.3 弹性三层

| 层 | 加的是什么 | 由谁触发 | 组件 |
|---|---|---|---|
| 工作负载层 | Pod 副本 | CPU、内存、自定义指标、定时 | HPA、CronHPA、KEDA |
| 资源层 | ECS 节点 | 有 Pod 因资源不足而 Pending | **节点自动伸缩**或**节点即时弹性**（两种方案二选一，即时弹性的扩容速度更快） |
| Serverless | 虚拟节点上的 Pod | 调度策略 | ACK Virtual Node |

注意事项：
- 节点伸缩是**按节点池**配置的，要设置最小和最大节点数。
- 缩容会驱逐节点上的 Pod，所以关键应用要配 PDB，也不要用本地盘存数据。
- 文档：[弹性伸缩概述](https://help.aliyun.com/zh/document_detail/2746875.html)

### 4.4 节点池
- 一个集群可以有多个节点池，比如“通用池”“内存型池”“GPU 池”“抢占式实例池”。
- 用 **标签 + 污点** 把特定工作负载引导到特定节点池：

```yaml
# 节点池上设置：标签 pool=spot，污点 pool=spot:NoSchedule
# 能接受被回收的批处理任务这样写：
nodeSelector:
  pool: spot
tolerations:
  - key: pool
    operator: Equal
    value: spot
    effect: NoSchedule
```

- 操作系统一般选 Alibaba Cloud Linux 3；也可以选 ContainerOS（专为容器设计的精简系统，启动更快）。
- 节点池支持一键升级 kubelet 和容器运行时，也有托管节点池可以自动修复和打补丁。

### 4.5 权限：RAM + RBAC 两层
1. **RAM**（阿里云层）：决定一个 RAM 用户能不能在控制台和 OpenAPI 里**看到、操作 ACK 集群这个云资源**（比如创建、删除集群，获取 kubeconfig）。
2. **RBAC**（K8s 层）：决定拿到 kubeconfig 以后，在集群**里面**能对哪些 Namespace 的哪些资源做什么。控制台的“授权管理”提供了预设角色：管理员、运维人员、开发人员、受限用户，也可以绑定自定义的 ClusterRole。

原则和 [security/03-infra-cloud/kubernetes-security.md](../security/03-infra-cloud/kubernetes-security.md) 一样：**最小权限，按 Namespace 授权，不给应用 cluster-admin**。

应用访问阿里云服务（比如读写 OSS）时，**不要把 AccessKey 写进镜像或 Secret**，而是用 **RRSA**（RAM Roles for Service Accounts）：给 ServiceAccount 绑定一个 RAM 角色，Pod 运行时自动拿到临时凭证。

### 4.6 安全清单（ACK 视角）
- [ ] API Server 公网访问只放行必要的 IP，或者干脆不开公网
- [ ] Pro 版开启 Secret 落盘加密（基于 KMS）
- [ ] 开启审计日志（投递到 SLS）
- [ ] 用策略治理（基于 Gatekeeper/OPA）禁止特权容器、禁止 `latest` 标签、限制可用的镜像仓库
- [ ] ACR 企业版开启镜像安全扫描，必要时开启镜像签名验证
- [ ] 节点及时升级，Kubernetes 版本在维护期内
- [ ] 业务 Namespace 配置默认拒绝的 NetworkPolicy（需要 Terway）

### 4.7 成本
- **抢占式实例**：价格低很多，但可能被回收。适合无状态、可以重试的工作负载，节点池里最好混用几种实例规格。
- **节省计划 / 包年包月**：给长期稳定的基础容量用，弹性部分用按量或抢占式实例。
- **requests 要设准**：requests 设得过大，节点上“预留了没用”的资源就是浪费。可以用 ACK 的**成本洞察**和资源画像功能，按 Namespace、按应用拆分成本，看看实际用量。
- **少开公网负载均衡**：多个 HTTP 服务共用一个 ALB Ingress，而不是每个 Service 都用 `type: LoadBalancer`。
- **实验环境**：下班就把节点池缩到 0，或者直接删掉集群。

### 4.8 备份与升级
- 有状态数据的首选是用托管服务（RDS、Tair）+ 它们自带的备份。
- 集群里的资源和 PV 可以用 ACK 的**备份中心**做备份，也可以跨集群恢复。
- 升级顺序：先看版本发布说明里的不兼容变更 → 升级控制面 → 升级各个节点池（滚动替换）→ 验证。

## 5. 类比在哪里不成立

- “虚拟场地”听起来像是没有机器；实际上是阿里云的机器，有地域和可用区，也会受库存限制。
- “通行证”在现实中只有一张；在 ACK 里是**两层**（RAM 管云资源，RBAC 管集群内部），两层都要配对。

## 6. 课堂小活动：发通行证（5 分钟，适合高年级）

准备三种颜色的卡片：绿色（只能看）、黄色（能下订单）、红色（能改规矩）。老师说出一个动作，比如“查看有几个托盘”“把订单改成 5 个”“删除整个片区”，拿着对应卡片的同学才能起立。讨论：为什么不给每个人都发红卡？

## 7. 孩子可能会问

- **问：便宜的临时场地为什么会被收回？**
  答：因为那是阿里云暂时没人用的场地，所以卖得便宜。别人出高价要用的时候，就会收回来。所以只能放那些“被赶走也没关系”的箱子。

## 8. 自测题

1. Terway 共享 ENI 和独占 ENI 模式的取舍是什么？
2. HPA、节点自动伸缩、虚拟节点各解决什么问题？它们怎么配合？
3. RAM 和 RBAC 分别控制什么？
4. 应用要读写 OSS，为什么不应该把 AccessKey 放进 Secret？推荐怎么做？
5. 列出三条在 ACK 上降低成本的做法。

<details>
<summary>参考答案</summary>

1. 共享 ENI 的 Pod 密度高，支持 eBPF 加速；独占 ENI 的性能最好，但受节点能挂的网卡数限制，Pod 密度低。
2. HPA 加 Pod；节点伸缩在 Pod 因资源不足 Pending 时加 ECS 节点；虚拟节点在不加节点的情况下，把 Pod 直接放到 Serverless 算力上，扩容最快。常见组合是 HPA 加 Pod，先用 ECS，不够时用虚拟节点顶上，同时节点伸缩慢慢补充 ECS。
3. RAM 控制谁能操作 ACK 这个云资源（建集群、拿 kubeconfig 等）；RBAC 控制在集群内部能对哪些 K8s 资源做什么。
4. 长期 AccessKey 一旦泄露风险很大，而且难以轮换。推荐用 RRSA，给 ServiceAccount 绑定 RAM 角色，Pod 运行时获取自动轮换的临时凭证。
5. 无状态负载用抢占式实例；按实际用量调准 requests；多个 HTTP 服务共用一个 ALB；长期基础容量用节省计划；实验环境不用时把节点池缩到 0 或删除集群。
</details>
