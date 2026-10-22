# CSRF 与 CORS

> 方向：Web · 相关标准：OWASP A01:2025、CWE-352（CSRF）、CWE-942（过于宽松的跨域策略） · 最后更新：2026-10-22

## 1. 核心要点

- **CSRF**：浏览器会自动给请求带上目标站点的 Cookie，所以恶意网站可以诱导用户的浏览器向你的网站发出“用户本人身份”的请求。
- CSRF 防御三件套：**`SameSite` Cookie + CSRF Token（或校验 `Origin` 头）+ 改状态的操作不用 GET**。
- **CORS 不是防护机制，而是“放宽”同源策略的机制**。配置错误会让任意网站读到本该只有你的前端才能读到的数据。
- 不要把请求的 `Origin` 原样反射到 `Access-Control-Allow-Origin` 里，更不要在这种情况下同时开启 `Access-Control-Allow-Credentials: true`。
- 使用 `Authorization` 头携带令牌的纯 API，天然不受 CSRF 影响（浏览器不会自动带这个头），但仍要正确配置 CORS。

## 2. 为什么重要

- **CSRF 成因**：服务端只靠 Cookie 识别用户，没有确认请求确实来自自己的页面。
- **CSRF 影响**：以受害者身份修改邮箱、转账、修改设置等。改了邮箱之后再走找回密码，就可能变成账号接管。
- **CORS 错配成因**：为了“方便联调”配成允许所有来源，或者用不严谨的字符串匹配校验来源（如 `endsWith("example.com")` 会匹配到 `evilexample.com`）。
- **CORS 错配影响**：攻击者的页面可以带着用户的 Cookie 读取 API 的响应，相当于跨站窃取数据。
- **标准**：[CWE-352](https://cwe.mitre.org/data/definitions/352.html)、[CWE-942](https://cwe.mitre.org/data/definitions/942.html)

## 3. 常见错误 vs 正确做法

**SameSite Cookie**

```text
# Lax：跨站的 GET 顶级导航会带 Cookie，跨站的 POST/iframe/fetch 不带。大多数站点的推荐默认值
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax

# Strict：任何跨站请求都不带，安全性最高，但从外部链接点进来时会表现为未登录
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict
```

`SameSite` 判断的是“站点”（注册域名，如 `example.com`），不是“源”。同一站点下的其他子域（如 `blog.example.com`）不受它限制，所以仍然需要 CSRF Token。

**CSRF Token（Flask-WTF 示例）**

```python
from flask_wtf.csrf import CSRFProtect

csrf = CSRFProtect(app)  # 所有 POST/PUT/PATCH/DELETE 请求都会校验 Token
```

```html
<form method="post" action="/settings/email">
  <input type="hidden" name="csrf_token" value="{{ csrf_token() }}">
  <input name="email" type="email">
</form>
```

**改状态的操作不要用 GET**

```python
# 错误：GET 请求会被 <img src="..."> 自动触发，而且 SameSite=Lax 也会放行顶级 GET 导航
@app.get("/account/delete")
def delete_account_unsafe():
    ...

# 正确：使用 POST/DELETE，并且受 CSRF 保护
@app.post("/account/delete")
def delete_account():
    ...
```

**CORS 配置**

```python
# 错误：把请求来源原样反射回去，并允许带凭证，等于允许任意网站读取用户数据
@app.after_request
def bad_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "")
    resp.headers["Access-Control-Allow-Credentials"] = "true"
    return resp
```

```python
# 正确：精确匹配白名单
ALLOWED_ORIGINS = {"https://app.example.com", "https://admin.example.com"}


@app.after_request
def cors(resp):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Vary"] = "Origin"  # 防止缓存把一个来源的响应返回给另一个来源
    return resp
```

另外注意：不要把 `null` 加进允许的来源，沙箱 iframe 和本地文件发出的请求 `Origin` 都是 `null`。

## 4. 如何识别

- 列出所有改变状态的接口，确认它们：不使用 GET，并且有 CSRF Token 或 `Origin` 校验。
- 检查 Session Cookie 的 `SameSite` 属性。
- 检查 CSRF 中间件的豁免列表（如 `@csrf.exempt`、`csrf_exempt`），每一项都要有合理理由。
- 检查 CORS 配置：
  - `Access-Control-Allow-Origin` 是否为 `*` 或直接反射请求来源
  - 来源校验是否用了 `startsWith`、`endsWith`、`includes`、未锚定的正则
  - 是否允许 `null`
  - 带凭证的响应有没有 `Vary: Origin`
- 动手验证：用 curl 带上 `Origin: https://evil.example` 请求自己的 API，看响应头是否放行。

## 5. 防御清单

- [ ] Session Cookie 设置 `SameSite=Lax` 或 `Strict`
- [ ] 使用 Cookie 认证的站点，所有改状态的请求校验 CSRF Token（或严格校验 `Origin`/`Referer`）
- [ ] 改状态的操作不使用 GET
- [ ] 敏感操作（改邮箱、改密码、支付）要求重新输入密码或二次确认
- [ ] CORS 允许的来源使用精确匹配的白名单，不反射、不允许 `null`
- [ ] 只有确实需要时才开启 `Access-Control-Allow-Credentials`，开启时绝不能搭配通配
- [ ] 带凭证的 CORS 响应设置 `Vary: Origin`
- [ ] `Access-Control-Allow-Methods` 和 `Access-Control-Allow-Headers` 只列出实际需要的项

## 6. 自测题

**Q1.** 为什么 CSRF 攻击能“以用户的身份”发出请求，但攻击者通常读不到响应？

<details><summary>答案</summary>

浏览器发请求时会自动带上目标站点的 Cookie，所以请求本身是带用户身份的。但同源策略阻止攻击者页面读取跨源响应的内容（除非 CORS 放行）。所以 CSRF 的危害在于“让用户执行操作”，而不是“读取数据”。CORS 错配则恰好补上了“读取”这一块。

</details>

**Q2.** 设置了 `SameSite=Lax` 之后，还需要 CSRF Token 吗？

<details><summary>答案</summary>

建议仍然保留。原因：`SameSite` 以站点为边界，同站的其他子域（可能被攻陷或存在 XSS）不受限制；`Lax` 会放行跨站的顶级 GET 导航，如果有用 GET 改状态的接口就会被利用；旧浏览器或特殊客户端可能不支持。CSRF Token 和 `SameSite` 配合使用是纵深防御。

</details>

**Q3.** `Access-Control-Allow-Origin: *` 和 `Access-Control-Allow-Credentials: true` 能一起使用吗？

<details><summary>答案</summary>

浏览器不允许这种组合，带凭证的请求会被拒绝。正因如此，很多开发者改成“把请求的 Origin 反射回去”来绕开限制，而这实际上比 `*` 更危险，因为它真的允许任意站点带着 Cookie 读取响应。

</details>

**Q4.** 用 `origin.endsWith("example.com")` 校验来源有什么问题？

<details><summary>答案</summary>

`https://evilexample.com` 也以 `example.com` 结尾，攻击者注册这个域名就能通过校验。应该对完整的来源字符串（协议 + 主机 + 端口）做精确匹配，或者使用严格锚定的正则表达式，比如 `^https://([a-z0-9-]+\.)?example\.com$`。

</details>

**Q5.** 只使用 `Authorization: Bearer` 头认证的 API，还需要防 CSRF 吗？

<details><summary>答案</summary>

一般不需要，因为浏览器不会自动给跨站请求加上 `Authorization` 头，攻击者的页面拿不到令牌。但前提是令牌不在 Cookie 里。如果令牌存在 Cookie 里、由服务端从 Cookie 读取，就又回到了需要防 CSRF 的情况。

</details>

## 7. 延伸阅读与练习

- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN：Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [MDN：SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitesamesite-value)
- [PortSwigger Academy：CSRF](https://portswigger.net/web-security/csrf)、[CORS](https://portswigger.net/web-security/cors)
