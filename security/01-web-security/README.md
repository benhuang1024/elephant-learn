# 01 Web/应用安全

Web 安全的核心问题只有一个：**服务端把不可信的输入当成了可信的**。这些输入可能是请求参数、Cookie、请求头、上传的文件，也可能是另一个系统返回的数据。本方向的每篇笔记，都是这个问题在不同场景下的具体表现。

## 前置知识

- HTTP 请求/响应结构、状态码、常见请求头
- Cookie 与 Session 的基本工作方式
- 浏览器同源策略（Same-Origin Policy）的概念
- 能读懂一种后端语言（示例以 Python 为主，部分 JavaScript）

## 要点速览与建议顺序

| 顺序 | 笔记 | 一句话要点 | OWASP 2025 |
| --- | --- | --- | --- |
| 1 | [访问控制](access-control.md) | 每个请求都要在服务端检查“这个人能不能对这个对象做这件事” | A01 |
| 2 | [认证与会话](authentication-session.md) | 密码用慢哈希，Session 用安全 Cookie，JWT 必须固定算法并校验 | A07 |
| 3 | [注入](injection.md) | 永远用参数化接口，不要把输入拼进查询或命令 | A05 |
| 4 | [XSS 与 CSP](xss-csp.md) | 按输出上下文编码，依赖框架自动转义，CSP 兜底 | A05 |
| 5 | [CSRF 与 CORS](csrf-cors.md) | 改状态的请求要防跨站伪造，CORS 只放行明确的来源 | A01 |
| 6 | [SSRF](ssrf.md) | 服务端代发请求必须做目标白名单，并在网络层隔离内部服务 | A01 |
| 7 | [安全配置](security-misconfig.md) | 关掉调试、隐藏错误细节、加安全响应头、去掉默认账号 | A02 |

OWASP Top 10:2025 完整列表（2025 版里 SSRF 被并入 A01 访问控制）：

1. A01 Broken Access Control
2. A02 Security Misconfiguration
3. A03 Software Supply Chain Failures（见 [依赖与供应链](../02-secure-coding/dependency-supply-chain.md)）
4. A04 Cryptographic Failures（见 [密码学使用](../02-secure-coding/crypto-usage.md)）
5. A05 Injection
6. A06 Insecure Design
7. A07 Authentication Failures
8. A08 Software or Data Integrity Failures
9. A09 Security Logging and Alerting Failures（见 [日志与监控](../03-infra-cloud/logging-monitoring.md)）
10. A10 Mishandling of Exceptional Conditions（见 [安全配置](security-misconfig.md)）

## 本方向练习

- [PortSwigger Web Security Academy](https://portswigger.net/web-security)：免费，按主题分实验，与本方向笔记一一对应，**首选**
- [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/)：本地用 Docker 跑起来的完整漏洞应用，覆盖 Top 10 大部分类别
