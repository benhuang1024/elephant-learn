# 安全要点知识库

用来系统提升安全能力的个人知识库，覆盖四个重要方向。每篇笔记都按同一结构组织：**核心要点 → 为什么重要 → 错误 vs 正确做法 → 如何识别 → 防御清单 → 自测题 → 延伸阅读与练习**（见 [note-template.md](note-template.md)）。

> **合法合规声明**：本库的内容只用于学习、防御、以及在获得明确授权的范围内测试。未经授权对他人系统做扫描、测试或攻击是违法的。动手练习请使用 [正规练习平台](04-offense-ctf/practice-platforms.md) 或自己搭建、完全归自己所有的环境。

## 怎么用

1. 先读每个方向的 `README.md`，快速过一遍本方向的要点速览。
2. 按建议顺序读笔记，**读完先做自测题**，答错的回去重读对应小节。
3. 把每篇的“防御清单”拿到自己的项目上逐条对照，这一步收获最大。
4. 每读完一个方向，到“延伸阅读与练习”里列的平台上完成对应模块。

## 推荐顺序

| 阶段 | 内容 | 目标 |
| --- | --- | --- |
| 1 | 01 Web 安全 | 理解最常见的 Web 漏洞成因和防御，建立“信任边界”的直觉 |
| 2 | 02 安全编码 | 把 Web 知识落到代码上，学会审计自己和别人的代码 |
| 3 | 03 基础设施与云 | 从应用往下看到主机、容器、K8s 和云权限 |
| 4 | 04 攻防与 CTF | 学会合规的测试方法论，通过 CTF 和靶场系统化练习 |

四个方向相对独立，有明确兴趣也可以直接跳到某个方向。

## 目录索引

### [01 Web/应用安全](01-web-security/README.md)

- [访问控制](01-web-security/access-control.md)：越权与 IDOR，所有鉴权都必须在服务端做
- [认证与会话](01-web-security/authentication-session.md)：密码存储、MFA、Cookie 属性、JWT 常见误用
- [注入](01-web-security/injection.md)：SQL/命令/模板注入，数据与代码分离
- [XSS 与 CSP](01-web-security/xss-csp.md)：按上下文做输出编码，CSP 做第二道防线
- [CSRF 与 CORS](01-web-security/csrf-cors.md)：SameSite、CSRF Token、不要乱开 CORS
- [SSRF](01-web-security/ssrf.md)：出站请求白名单，保护云元数据服务
- [安全配置](01-web-security/security-misconfig.md)：响应头、错误信息、默认配置

### [02 安全编码/代码审计](02-secure-coding/README.md)

- [代码审计清单](02-secure-coding/code-review-checklist.md)：信任边界、输入到危险函数的数据流
- [输入输出处理](02-secure-coding/input-output-handling.md)：校验、编码、反序列化、文件路径
- [密码学使用](02-secure-coding/crypto-usage.md)：选对算法和库，别自己造
- [密钥管理](02-secure-coding/secrets-management.md)：不硬编码，泄露后先吊销
- [依赖与供应链](02-secure-coding/dependency-supply-chain.md)：锁版本、扫描依赖、加固 CI
- [安全工具](02-secure-coding/security-tooling.md)：SAST、SCA、秘密扫描怎么接入

### [03 基础设施/云安全](03-infra-cloud/README.md)

- [Linux 加固](03-infra-cloud/linux-hardening.md)：账号权限、SSH、补丁、审计
- [网络安全](03-infra-cloud/network-security.md)：最小暴露面、分段、TLS
- [容器安全](03-infra-cloud/container-security.md)：可信镜像、非 root、只读、资源限制
- [Kubernetes 安全](03-infra-cloud/kubernetes-security.md)：RBAC、Pod 安全标准、NetworkPolicy
- [云 IAM](03-infra-cloud/cloud-iam.md)：最小权限、短期凭证、常见错配
- [日志与监控](03-infra-cloud/logging-monitoring.md)：该记什么、怎么告警、应急响应

### [04 攻防实战/CTF](04-offense-ctf/README.md)

- [道德与授权范围](04-offense-ctf/ethics-and-scope.md)：先有授权，再谈测试
- [渗透测试方法论](04-offense-ctf/pentest-methodology.md)：标准流程与报告写作
- [练习平台](04-offense-ctf/practice-platforms.md)：正规平台与学习路线

### 其他

- [学习资源](resources.md)：标准、书籍、持续关注的信息源
- [笔记模板](note-template.md)：新增笔记时复制使用
