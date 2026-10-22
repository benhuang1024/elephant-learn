# Kubernetes 安全

> 方向：基础设施 · 相关标准：CIS Kubernetes Benchmark、Kubernetes Pod Security Standards、NSA/CISA Kubernetes Hardening Guide · 最后更新：2026-10-22

## 1. 核心要点

- **RBAC 最小权限**：不给应用和用户 `cluster-admin`，避免在 Role 里使用 `*`，特别注意 `secrets`、`pods/exec`、`create pods` 这类高危权限。
- **Pod 安全标准**：为命名空间启用 Pod Security Admission 的 `restricted` 级别，禁止特权容器、宿主机命名空间、hostPath 等。
- **网络策略**：Pod 之间默认可以互相访问。为每个命名空间设置**默认拒绝**的 NetworkPolicy，再按需放行。
- **服务账号**：不需要访问 API Server 的 Pod 关闭令牌自动挂载；每个应用使用独立的服务账号。
- **Secret**：Kubernetes Secret 默认只是 Base64 编码，要开启 etcd 静态加密，并限制谁能读取；更推荐结合外部密钥管理服务。

## 2. 为什么重要

- **成因**：为了快速跑起来直接给了宽泛的权限；Pod 安全设置没有统一要求；没有网络策略；Dashboard 或 API Server 暴露在公网。
- **影响**：一个 Pod 被入侵后，攻击者可以利用挂载的服务账号令牌调用 API，读取 Secret、创建特权 Pod，最终控制节点和整个集群；在扁平的 Pod 网络中横向移动到数据库等服务。
- **标准**：[Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)、[CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)

## 3. 常见错误 vs 正确做法

**RBAC**

```yaml
# 错误：给应用绑定 cluster-admin，或者使用通配符
# kind: ClusterRoleBinding
# roleRef: { kind: ClusterRole, name: cluster-admin }
#
# rules:
#   - apiGroups: ["*"]
#     resources: ["*"]
#     verbs: ["*"]
```

```yaml
# 正确：只在需要的命名空间里，授予需要的资源和动作
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: configmap-reader
  namespace: myapp
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["myapp-config"]
    verbs: ["get", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: myapp-configmap-reader
  namespace: myapp
subjects:
  - kind: ServiceAccount
    name: myapp
    namespace: myapp
roleRef:
  kind: Role
  name: configmap-reader
  apiGroup: rbac.authorization.k8s.io
```

**为命名空间启用 Pod 安全标准**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: myapp
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/audit: restricted
```

**符合 `restricted` 要求的 Pod 安全上下文**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: myapp
spec:
  replicas: 2
  selector:
    matchLabels: { app: myapp }
  template:
    metadata:
      labels: { app: myapp }
    spec:
      serviceAccountName: myapp
      automountServiceAccountToken: false   # 应用不需要访问 API Server 时关闭
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: registry.example.com/myapp@sha256:0000000000000000000000000000000000000000000000000000000000000000
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { memory: 256Mi }
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
```

镜像 digest 是占位值，实际使用时替换为真实镜像的 digest。

**默认拒绝的 NetworkPolicy，再按需放行**

```yaml
# 拒绝命名空间内所有 Pod 的入站和出站流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: myapp
spec:
  podSelector: {}
  policyTypes: ["Ingress", "Egress"]
---
# 只允许 ingress-nginx 命名空间访问 myapp 的 8080 端口
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-to-myapp
  namespace: myapp
spec:
  podSelector:
    matchLabels: { app: myapp }
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - port: 8080
          protocol: TCP
```

设置了默认拒绝出站之后，别忘了放行 DNS（通常是 `kube-system` 命名空间中的 CoreDNS，UDP/TCP 53 端口）。另外，NetworkPolicy 需要 CNI 插件支持（如 Calico、Cilium），否则不会生效。

## 4. 如何识别

```bash
# 查看某个服务账号能做什么
kubectl auth can-i --list --as=system:serviceaccount:myapp:myapp -n myapp

# 找出所有绑定了 cluster-admin 的主体
kubectl get clusterrolebindings -o json | \
  jq -r '.items[] | select(.roleRef.name=="cluster-admin") | .metadata.name + " -> " + ([.subjects[]? | .kind + ":" + .name] | join(", "))'

# 查看哪些命名空间设置了 Pod 安全标签
kubectl get ns -L pod-security.kubernetes.io/enforce

# 查看每个命名空间的 NetworkPolicy
kubectl get networkpolicy -A
```

- 检查高危权限：能读取 `secrets`、能创建 `pods`、能 `pods/exec`、能修改 RBAC 本身、能 `impersonate`，都可能被用来提升权限。
- 检查工作负载：`privileged: true`、`hostNetwork`、`hostPID`、`hostPath` 挂载、以 root 运行、没有资源限制。
- 运行 [kube-bench](https://github.com/aquasecurity/kube-bench) 对照 CIS 基线检查节点和控制平面配置。
- 用 `trivy k8s` 或 [Kubescape](https://kubescape.io/) 扫描集群和 YAML 中的配置问题。

## 5. 防御清单

- [ ] API Server 不暴露在公网，或者至少限制来源并开启认证
- [ ] 不给应用和普通用户 `cluster-admin`，Role 中避免通配符
- [ ] 严格控制 `secrets` 读取、`pods/exec`、创建 Pod、修改 RBAC 的权限
- [ ] 每个应用使用独立的服务账号，不需要时关闭令牌自动挂载
- [ ] 业务命名空间启用 Pod Security Admission 的 `restricted` 级别
- [ ] 容器以非 root 运行，禁止特权提升，删除所有 capabilities，根文件系统只读
- [ ] 每个命名空间设置默认拒绝的 NetworkPolicy，再按需放行
- [ ] 开启 etcd 静态加密，或使用外部密钥管理（如 External Secrets Operator + 云 KMS）
- [ ] 开启 API Server 审计日志
- [ ] 及时升级 Kubernetes 版本和节点系统
- [ ] 镜像只从可信仓库拉取，可以用准入控制器（如 Kyverno、OPA Gatekeeper）强制执行策略
- [ ] 所有工作负载设置资源请求和限制

## 6. 自测题

**Q1.** 为什么“能创建 Pod”这个权限很危险？

<details><summary>答案</summary>

能创建 Pod 的主体可以创建一个特权 Pod、挂载宿主机根目录，或者挂载该命名空间里任意服务账号的令牌和任意 Secret，从而间接获得这些权限，甚至控制节点。如果没有 Pod 安全标准或准入策略的限制，“创建 Pod”几乎等同于获得节点的 root 权限。

</details>

**Q2.** Kubernetes Secret 是加密存储的吗？

<details><summary>答案</summary>

默认不是。Secret 在 API 中以 Base64 编码表示，在 etcd 中默认以明文存储。需要配置 etcd 静态加密（最好使用 KMS 提供方）才会加密存储。即便如此，拥有 Secret 读取权限的主体仍然可以通过 API 读到明文，所以 RBAC 控制同样重要。

</details>

**Q3.** 为什么建议关闭 `automountServiceAccountToken`？

<details><summary>答案</summary>

默认情况下 Pod 会挂载服务账号令牌，应用被入侵后，攻击者可以用这个令牌调用 API Server。大部分业务应用根本不需要访问 API Server，关闭自动挂载可以消除这条攻击路径。确实需要时，再为它单独开启，并授予最小权限。

</details>

**Q4.** 创建了 NetworkPolicy 但没有效果，可能是什么原因？

<details><summary>答案</summary>

常见原因：集群使用的 CNI 插件不支持 NetworkPolicy（比如某些基础的 flannel 配置），这时策略对象可以创建但不会被执行；`podSelector` 的标签写错，没有选中目标 Pod；只写了 Ingress 而问题出在 Egress，或者反过来。

</details>

**Q5.** Pod 安全标准中的 `privileged`、`baseline`、`restricted` 三个级别有什么区别？

<details><summary>答案</summary>

`privileged` 不做任何限制，用于系统级组件。`baseline` 阻止已知的提权配置，如特权容器、宿主机命名空间、hostPath 等，兼容大多数应用。`restricted` 在 `baseline` 的基础上进一步要求遵循加固最佳实践：必须以非 root 运行、禁止特权提升、删除所有 capabilities、必须设置 seccomp 配置等。业务命名空间推荐使用 `restricted`。

</details>

## 7. 延伸阅读与练习

- [Kubernetes 官方文档：Security](https://kubernetes.io/docs/concepts/security/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [OWASP Kubernetes Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Kubernetes_Security_Cheat_Sheet.html)
- [NSA/CISA Kubernetes Hardening Guide](https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF)
- [kube-bench](https://github.com/aquasecurity/kube-bench)、[Kubescape](https://kubescape.io/)
- 练习：用 kind 在本地创建一个集群，部署上面的 Deployment 和 NetworkPolicy（先用一个 Pod 测试策略是否真的生效；较旧版本的 kind 自带的 CNI 不执行 NetworkPolicy，这时改用 Calico 或 Cilium）；运行 kube-bench 和 Kubescape，处理发现的问题
