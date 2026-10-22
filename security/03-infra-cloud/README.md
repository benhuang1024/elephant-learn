# 03 基础设施/云安全

应用代码写得再安全，如果跑在一台 SSH 允许密码登录的主机上，以 root 身份运行在特权容器里，或者用的是拥有管理员权限的云凭证，一个小问题就会变成整个系统被控制。本方向关注应用之下的各层：主机、网络、容器、Kubernetes、云平台，以及如何发现问题（日志与监控）。

贯穿本方向的三个原则：

1. **最小权限**：每个账号、进程、容器、服务账号、云角色只拥有完成工作所需的最少权限
2. **最小暴露面**：不需要的端口、服务、功能一律关闭
3. **纵深防御**：假设某一层会被突破，下一层仍然能够限制影响范围

## 前置知识

- Linux 基础命令、文件权限、用户与组、systemd
- TCP/IP 基础：IP、端口、TCP/UDP、DNS、HTTP/TLS
- 会用 Docker 构建和运行镜像
- 了解 Kubernetes 的基本对象（Pod、Deployment、Service、Namespace）
- 用过至少一个云平台（AWS、GCP、Azure 或国内云厂商）

## 要点速览与建议顺序

| 顺序 | 笔记 | 一句话要点 |
| --- | --- | --- |
| 1 | [Linux 加固](linux-hardening.md) | 禁止 root 和密码登录 SSH，及时打补丁，服务用专用低权限账号运行 |
| 2 | [网络安全](network-security.md) | 默认拒绝入站，按需开放；分区隔离；对外服务统一 TLS |
| 3 | [容器安全](container-security.md) | 最小基础镜像，非 root 运行，不用特权模式，扫描镜像漏洞 |
| 4 | [Kubernetes 安全](kubernetes-security.md) | RBAC 最小权限，启用 Pod 安全标准，默认拒绝的 NetworkPolicy |
| 5 | [云 IAM](cloud-iam.md) | 不用根账号，用角色和短期凭证，策略不写通配符，开启审计日志 |
| 6 | [日志与监控](logging-monitoring.md) | 记录安全事件，集中存储，设置告警，提前准备好应急响应流程 |

## 本方向练习

- 在本地虚拟机或云上的测试实例上，按 [Linux 加固](linux-hardening.md) 的清单逐项加固，并用 [Lynis](https://cisofy.com/lynis/) 对比加固前后的评分
- 用 [Trivy](https://trivy.dev/) 扫描自己的 Docker 镜像，把 critical/high 漏洞降到 0
- 用 [kind](https://kind.sigs.k8s.io/) 在本地起一个集群，用 [kube-bench](https://github.com/aquasecurity/kube-bench) 对照 CIS 基线检查
- 云平台练习：[flAWS](http://flaws.cloud/) 和 [flAWS2](http://flaws2.cloud/) 是专门为学习 AWS 常见错配而设计的公开练习
