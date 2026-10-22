# 安全配置与异常处理（Security Misconfiguration）

> 方向：Web · 相关标准：OWASP A02:2025（安全配置错误）、A10:2025（异常情况处理不当）、CWE-16、CWE-209（错误信息泄露）、CWE-636（失败时放行） · 最后更新：2026-10-22

## 1. 核心要点

- 生产环境**关闭调试模式**，错误页面不向用户展示堆栈、SQL、内部路径和版本号。
- 出错时要**安全地失败（fail closed）**：鉴权服务超时、校验抛异常时，应该拒绝请求，而不是放行。
- 加上必要的**安全响应头**：HSTS、CSP、`X-Content-Type-Options`、`frame-ancestors`、`Referrer-Policy`。
- 删除或禁用**默认账号、示例应用、管理控制台、目录列表**，不需要的功能和端口一律关掉。
- 配置要**可重复、可审计**：用代码管理配置（IaC），各环境配置一致，变更有记录。

## 2. 为什么重要

- **成因**：开发阶段为了方便而开的选项被带到了生产环境；默认配置不安全；环境之间配置不一致；异常处理只考虑了“正常失败”。
- **影响**：调试控制台可能直接执行代码；详细错误信息帮助攻击者了解系统内部；云存储桶被公开导致数据泄露；异常处理放行导致鉴权被绕过。
- **2025 版变化**：安全配置错误从第 5 位升到第 2 位；新增 A10“异常情况处理不当”，专门关注错误处理、逻辑错误和“失败时放行”。
- **标准**：[OWASP A02:2025、A10:2025](https://top10.owasp.org/2025)、[CWE-209](https://cwe.mitre.org/data/definitions/209.html)

## 3. 常见错误 vs 正确做法

**调试模式**

```python
# 错误：Flask/Werkzeug 的调试器可以在浏览器里执行任意 Python 代码
app.run(host="0.0.0.0", debug=True)
```

```python
# 正确：调试开关由环境变量控制，生产环境用 WSGI 服务器（gunicorn 等）启动
import os

app.config["DEBUG"] = os.environ.get("APP_ENV") == "development"
```

Django 对应 `DEBUG = False`，并且要配置 `ALLOWED_HOSTS`。

**错误信息**

```python
# 错误：把异常详情直接返回给用户
@app.errorhandler(Exception)
def handle_error_unsafe(e):
    return {"error": str(e), "trace": traceback.format_exc()}, 500
```

```python
import logging
import uuid

logger = logging.getLogger(__name__)


# 正确：详情只写日志，给用户返回通用信息和一个便于排查的请求 ID
@app.errorhandler(Exception)
def handle_error(e):
    error_id = uuid.uuid4().hex
    logger.exception("unhandled error id=%s", error_id)
    return {"error": "服务器内部错误", "error_id": error_id}, 500
```

**失败时放行（fail open）vs 失败时拒绝（fail closed）**

```python
# 错误：权限服务异常时默认放行
def can_access_unsafe(user, resource):
    try:
        return policy_client.check(user, resource)
    except Exception:
        return True
```

```python
# 正确：任何异常都按“无权限”处理，并记录日志
def can_access(user, resource):
    try:
        return policy_client.check(user, resource) is True
    except Exception:
        logger.exception("policy check failed")
        return False
```

**安全响应头（Nginx 示例）**

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "frame-ancestors 'self'; object-src 'none'; base-uri 'none'" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

# 隐藏版本号
server_tokens off;
# 关闭目录列表
autoindex off;
```

`X-Frame-Options` 已经被 CSP 的 `frame-ancestors` 取代，为了兼容旧浏览器可以同时保留。`X-XSS-Protection` 已经过时，不需要再设置。

## 4. 如何识别

- 搜索 `debug=True`、`DEBUG = True`、`NODE_ENV` 未设置为 `production`、`app.use(errorHandler())` 等开发配置。
- 故意触发错误（访问不存在的路径、传错误类型的参数），看响应中是否有堆栈、SQL、内部路径、框架版本。
- 检查 `except` 分支里是否有 `return True`、`pass` 后继续执行敏感操作等“失败放行”的写法。
- 用 [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory) 或 curl 检查自己网站的响应头。
- 检查是否暴露了不该暴露的路径：`/.git/`、`/.env`、`/actuator`、`/phpinfo.php`、`/server-status`、Swagger/GraphQL 调试界面。
- 检查云存储桶、数据库、缓存服务的访问策略是否公开（见 [云 IAM](../03-infra-cloud/cloud-iam.md)）。

## 5. 防御清单

- [ ] 生产环境关闭调试模式和开发工具
- [ ] 统一的错误处理：用户看到通用信息和错误 ID，详情只进日志
- [ ] 异常、超时、未知状态一律按拒绝处理（fail closed）
- [ ] 启用 HSTS、CSP（至少包含 `frame-ancestors`）、`X-Content-Type-Options: nosniff`、`Referrer-Policy`
- [ ] 隐藏服务器和框架版本号
- [ ] 关闭目录列表，确保 `.git`、`.env`、备份文件等不会被 Web 访问
- [ ] 删除默认账号、示例应用和测试接口，修改所有默认密码
- [ ] 管理后台、监控接口（如 Spring Actuator）不对公网开放，并且要求认证
- [ ] 配置用代码管理（IaC），并用基线扫描工具定期检查
- [ ] 各环境配置保持一致，差异只体现在明确的环境变量里

## 6. 自测题

**Q1.** 为什么生产环境开启 Flask/Werkzeug 的调试模式是严重问题，而不只是“信息泄露”？

<details><summary>答案</summary>

Werkzeug 调试器在出错页面上提供交互式控制台，可以执行任意 Python 代码。虽然有 PIN 码保护，但如果 PIN 可以被推算或者泄露，就相当于直接让攻击者在服务器上执行代码。

</details>

**Q2.** 什么是“失败时放行（fail open）”？举一个例子。

<details><summary>答案</summary>

系统在出错或无法判断时选择允许操作。例子：调用权限服务超时后，`except` 分支返回 `True`；验证码服务不可用时直接跳过验证；签名校验抛异常时被捕获后继续处理请求。安全相关的判断应该在出错时拒绝。

</details>

**Q3.** HSTS 解决什么问题？

<details><summary>答案</summary>

HSTS 告诉浏览器在一段时间内只通过 HTTPS 访问这个站点，即使用户输入的是 `http://` 或点击了 HTTP 链接。这样可以防止首次请求被中间人降级为 HTTP（SSL 剥离）。加入 HSTS 预加载列表后，连第一次访问也受保护。

</details>

**Q4.** 返回给用户的错误信息里应该包含什么，不应该包含什么？

<details><summary>答案</summary>

应该包含：对用户有用的通用描述（如“请求参数无效”），以及一个用于排查的错误 ID。不应该包含：堆栈信息、SQL 语句、内部文件路径、主机名、框架和组件的版本号、第三方服务返回的原始错误。

</details>

**Q5.** 为什么“只在内网访问”不能作为管理接口不设认证的理由？

<details><summary>答案</summary>

内网边界并不可靠：SSRF、员工设备被攻陷、VPN 账号泄露、配置错误导致端口暴露到公网，都会让“内网”接口被访问到。零信任的原则是：每个服务都要自己做认证和授权，不依赖网络位置。

</details>

## 7. 延伸阅读与练习

- [OWASP HTTP Security Response Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OWASP Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)
- [Mozilla Web Security Guidelines](https://infosec.mozilla.org/guidelines/web_security)
- [PortSwigger Academy：Information disclosure](https://portswigger.net/web-security/information-disclosure)
