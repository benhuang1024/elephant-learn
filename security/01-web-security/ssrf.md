# SSRF（服务端请求伪造）

> 方向：Web · 相关标准：OWASP A01:2025（2025 版并入访问控制）、CWE-918 · 最后更新：2026-10-22

## 1. 核心要点

- SSRF 是指：攻击者让**你的服务器**代替他去请求一个地址。服务器通常位于内网，能访问攻击者直接访问不到的东西。
- 最危险的目标是**云元数据服务**（如 `169.254.169.254`），可能泄露云平台的临时凭证。
- 防御首选**目标白名单**：只允许访问明确列出的域名，而不是去拦截“看起来像内网”的地址。
- 必须校验**解析后的 IP**，并且实际连接时使用的必须就是校验过的那个 IP；重定向要关掉或逐跳校验。
- **网络层兜底**：发起外部请求的服务放在受限的网络出口后面，云上强制使用 IMDSv2 等加固措施。

## 2. 为什么重要

- **成因**：功能需要服务端去取一个用户给的 URL，比如网页预览、头像 URL 导入、Webhook 回调、PDF 生成、文件导入。
- **影响**：
  - 访问内网管理后台、数据库、缓存等未鉴权服务
  - 读取云元数据，拿到云账号凭证，进一步控制云资源
  - 扫描内网、绕过防火墙
- **为什么容易被绕过**：只做字符串层面的黑名单，会被各种方式绕过。例如 IP 有多种写法（十进制、十六进制、IPv6 映射地址），一个域名可以解析到内网 IP，校验通过后的重定向，以及 DNS 重绑定（校验时解析到公网，连接时解析到内网）。
- **标准**：[CWE-918](https://cwe.mitre.org/data/definitions/918.html)

## 3. 常见错误 vs 正确做法

**错误：直接请求用户给的 URL**

```python
import requests


def fetch_preview_unsafe(url: str) -> bytes:
    return requests.get(url, timeout=5).content
```

**错误：字符串黑名单**

```python
# 拦不住 http://2130706433/（127.0.0.1 的十进制写法）、
# 解析到内网的域名、以及跳转到内网的重定向
if "127.0.0.1" in url or "localhost" in url:
    raise ValueError("blocked")
```

**正确思路一：业务允许时，只访问白名单域名**

```python
from urllib.parse import urlsplit

ALLOWED_HOSTS = {"images.partner.example", "cdn.partner.example"}


def check_allowed_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise ValueError("目标地址不在允许范围内")
    return url
```

**正确思路二：必须访问任意公网地址时，校验解析结果，并且连接时使用校验过的 IP**

```python
import ipaddress
import socket
from urllib.parse import urlsplit


def resolve_public_ip(url: str) -> tuple[str, str, int]:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("只允许 http/https")
    port = parts.port or (443 if parts.scheme == "https" else 80)

    # 解析出所有 IP，任何一个不是公网地址都拒绝
    infos = socket.getaddrinfo(parts.hostname, port, proto=socket.IPPROTO_TCP)
    ips = {info[4][0] for info in infos}
    for ip in ips:
        addr = ipaddress.ip_address(ip)
        if not addr.is_global:   # 覆盖私网、回环、链路本地（包含 169.254.x.x）、保留地址等
            raise ValueError("目标解析到非公网地址")

    # 返回校验过的 IP；后续连接必须使用这个 IP（同时设置 Host 头/SNI 为原域名），
    # 不能再让 HTTP 客户端重新解析域名，否则会被 DNS 重绑定绕过。
    return parts.hostname, sorted(ips)[0], port
```

实际项目里，自己正确实现“固定 IP 连接 + TLS SNI”比较繁琐，更推荐：

- 使用专门做了 SSRF 防护的 HTTP 库或出站代理，在连接阶段校验 IP（比如 [Smokescreen](https://github.com/stripe/smokescreen) 这类出站代理）
- 关闭自动重定向（`allow_redirects=False`），确实需要时每一跳都重新校验
- 只允许需要的协议（不要允许 `file://`、`gopher://`、`ftp://`）
- 设置超时和响应体大小上限

**云元数据加固（AWS 示例）**

```bash
# 强制要求 IMDSv2（基于会话令牌，需要先发 PUT 请求获取令牌），
# 并把跳数限制为 1，避免容器内的进程访问宿主机的元数据
aws ec2 modify-instance-metadata-options \
  --instance-id i-0123456789abcdef0 \
  --http-tokens required \
  --http-put-response-hop-limit 1
```

## 4. 如何识别

- 搜索服务端发起 HTTP 请求的代码：`requests.get(`、`urllib.request.urlopen`、`httpx`、`fetch(`、`axios`、`http.Get(`、`HttpClient`，看 URL 是否部分或全部来自用户输入。
- 特别关注这些功能：URL 预览、从 URL 导入图片或文件、Webhook、HTML 转 PDF/截图（无头浏览器会加载页面里的资源）、XML 解析（XXE 也能导致 SSRF）、SVG 处理。
- 检查校验逻辑是不是字符串黑名单，有没有处理 DNS 解析和重定向。
- 检查网络层面：发起请求的服务能否访问内网和元数据地址，云主机是否强制使用 IMDSv2。

## 5. 防御清单

- [ ] 能用白名单的场景（固定合作方、固定域名）一律使用白名单
- [ ] 只允许 `http`/`https` 协议
- [ ] 校验解析后的所有 IP，拒绝私网、回环、链路本地、保留地址，IPv4 和 IPv6 都要覆盖
- [ ] 连接时使用校验过的 IP，防御 DNS 重绑定；或者使用在连接阶段做校验的出站代理
- [ ] 关闭自动重定向，或者每一跳都重新校验
- [ ] 设置超时、响应大小上限，不把原始错误信息和响应内容直接返回给用户
- [ ] 发起外部请求的服务部署在隔离的网络环境中，出站流量经过受控代理
- [ ] 云主机强制使用 IMDSv2（或对应云平台的等价机制），实例角色只授予最小权限
- [ ] 内网服务本身也要有认证，不要因为“只在内网”就不设防

## 6. 自测题

**Q1.** 为什么 SSRF 在云环境里特别危险？

<details><summary>答案</summary>

云主机可以通过链路本地地址访问元数据服务，元数据里可能包含实例角色的临时凭证。如果服务端存在 SSRF，攻击者可能借服务器之手读到这些凭证，再用它们直接调用云 API，影响范围会从一个应用扩大到整个云账号的资源。

</details>

**Q2.** 校验时把域名解析成 IP，确认是公网地址后再用 `requests.get(url)` 发请求，还有什么问题？

<details><summary>答案</summary>

`requests.get(url)` 会再解析一次域名。攻击者控制的 DNS 可以第一次返回公网 IP、第二次返回内网 IP（DNS 重绑定），校验和实际连接用的不是同一个 IP。另外，如果没有关闭重定向，目标服务器可以返回 302 跳转到内网地址。

</details>

**Q3.** 为什么推荐白名单而不是黑名单？

<details><summary>答案</summary>

黑名单要穷举所有“不该访问”的地址和写法：各种 IP 编码方式、IPv6、解析到内网的域名、云厂商的特殊地址，很难做到完整。白名单只需要列出“该访问”的少数地址，未知的情况默认拒绝，更符合“默认拒绝”的原则。

</details>

**Q4.** AWS 的 IMDSv2 是如何降低 SSRF 风险的？

<details><summary>答案</summary>

IMDSv2 要求先用 PUT 请求获取会话令牌，再在后续请求中带上这个令牌。大多数 SSRF 只能让服务器发出简单的 GET 请求，无法控制请求方法和请求头，所以拿不到令牌。再配合跳数限制为 1，容器等多一跳网络的环境也访问不到。它是缓解措施，不能替代应用层的修复。

</details>

**Q5.** 除了“URL 预览”，还有哪些常见功能可能引入 SSRF？

<details><summary>答案</summary>

Webhook 回调地址、从 URL 导入文件或头像、HTML 转 PDF 或网页截图（渲染引擎会加载页面中的外部资源）、XML 解析中的外部实体、SVG/图片处理库加载外部引用、OAuth/OpenID 的元数据发现地址、各种“测试连接”功能。

</details>

## 7. 延伸阅读与练习

- [OWASP Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [AWS：使用 IMDSv2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html)
- [PortSwigger Academy：SSRF](https://portswigger.net/web-security/ssrf)
