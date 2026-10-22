# XSS 与 CSP（跨站脚本与内容安全策略）

> 方向：Web · 相关标准：OWASP A05:2025（2021 版起 XSS 归入注入）、CWE-79 · 最后更新：2026-10-22

## 1. 核心要点

- XSS 是**注入到浏览器里的注入**：不可信数据被浏览器当作 HTML 或 JavaScript 执行。
- 主要防御是**按输出上下文编码**：HTML 正文、HTML 属性、JavaScript、URL、CSS，各自的编码规则不同。
- 优先依赖框架的**自动转义**（React、Vue、Jinja2、Django 模板默认都会转义），警惕绕过自动转义的接口：`dangerouslySetInnerHTML`、`v-html`、`|safe`、`innerHTML`。
- 必须渲染用户提供的 HTML 时（如富文本），用成熟的净化库（DOMPurify 等）做白名单过滤。
- **CSP 是第二道防线**：即使出现漏洞，严格的 CSP 也能阻止大部分注入脚本执行。

## 2. 为什么重要

- **成因**：把用户输入原样输出到页面，或者在前端用 `innerHTML`、`document.write` 处理不可信数据。
- **影响**：脚本以受害者的身份在受害网站上运行，可以读取页面数据、发起请求、修改页面内容、钓鱼，在没有 `HttpOnly` 时还能窃取 Cookie。
- **三种类型**：
  - **反射型**：恶意内容来自当前请求（如 URL 参数），服务端直接回显
  - **存储型**：恶意内容被存进数据库，所有查看该内容的用户都会受影响，危害最大
  - **DOM 型**：问题完全在前端，JavaScript 把 `location.hash` 等不可信数据写进了危险的 DOM 接口
- **标准**：[CWE-79](https://cwe.mitre.org/data/definitions/79.html)

## 3. 常见错误 vs 正确做法

**前端 DOM 操作**

```javascript
// 错误：innerHTML 会解析 HTML，<img src=x onerror=...> 这类内容会执行
function renderCommentUnsafe(el, comment) {
  el.innerHTML = comment;
}

// 正确：textContent 只当作文本
function renderComment(el, comment) {
  el.textContent = comment;
}
```

**React**

```javascript
// 正确：JSX 中的 {comment} 会被自动转义
// <p>{comment}</p>

// 需要渲染富文本时，先用 DOMPurify 净化
import DOMPurify from "dompurify";

function sanitizeRichText(html) {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
// <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />
```

**服务端模板（Jinja2）**

```python
from markupsafe import escape

# 错误：|safe 关闭了自动转义
# <p>{{ comment | safe }}</p>

# 正确：默认的 {{ comment }} 会自动转义
# <p>{{ comment }}</p>

# 在模板之外手动拼 HTML 时，显式转义
html = f"<p>{escape(comment)}</p>"
```

**URL 上下文：转义不够，还要校验协议**

```javascript
// HTML 转义不能阻止 javascript: 协议，必须校验 URL 协议
function safeHref(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}
```

**CSP：推荐使用基于 nonce 的严格策略**

```text
Content-Security-Policy:
  script-src 'nonce-{每次请求随机生成}' 'strict-dynamic';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'self';
  report-to csp-endpoint
```

```html
<!-- 只有带正确 nonce 的脚本才会执行；注入进来的脚本没有 nonce -->
<script nonce="{{ csp_nonce }}" src="/static/app.js"></script>
```

上线严格 CSP 之前，先用 `Content-Security-Policy-Report-Only` 观察一段时间违规报告，确认不会影响正常功能。

## 4. 如何识别

- 前端搜索危险接口：`innerHTML`、`outerHTML`、`insertAdjacentHTML`、`document.write`、`eval`、`setTimeout(字符串)`、`dangerouslySetInnerHTML`、`v-html`。
- 模板搜索关闭转义的写法：`|safe`、`{% autoescape false %}`、`mark_safe`、`Markup(`、`{{{ }}}`（Handlebars）。
- 找出用户输入出现在 `href`、`src`、内联事件属性、`<script>` 块、`style` 中的位置，这些上下文的编码规则和 HTML 正文不同。
- 检查响应头里是否有 CSP，策略中是否包含 `'unsafe-inline'`、`'unsafe-eval'` 或 `*` 这类会削弱防护的配置。
- 用 [CSP Evaluator](https://csp-evaluator.withgoogle.com/) 评估现有策略。

## 5. 防御清单

- [ ] 模板引擎开启自动转义，代码中关闭转义的地方都经过审查
- [ ] 前端默认使用 `textContent` / 框架绑定，不用 `innerHTML` 处理不可信数据
- [ ] 富文本使用 DOMPurify 等成熟库做白名单净化
- [ ] 用户提供的 URL 校验协议，只允许 `http`/`https`
- [ ] 部署基于 nonce 或 hash 的 CSP，禁用 `'unsafe-inline'` 和 `'unsafe-eval'`
- [ ] 设置 `object-src 'none'`、`base-uri 'none'`
- [ ] Session Cookie 设置 `HttpOnly`，减轻 XSS 的后果
- [ ] 响应正确设置 `Content-Type` 和 `X-Content-Type-Options: nosniff`
- [ ] 有条件的项目考虑启用 Trusted Types

## 6. 自测题

**Q1.** 反射型、存储型、DOM 型 XSS 的主要区别是什么？

<details><summary>答案</summary>

区别在于恶意数据来自哪里、在哪里被执行。反射型：数据来自当前请求，服务端直接回显。存储型：数据先被存储，之后展示给其他用户，影响面最广。DOM 型：服务端可能完全不参与，是前端 JavaScript 把不可信数据写进了危险的 DOM 接口。

</details>

**Q2.** 已经对 `<`、`>`、`"` 做了 HTML 转义，把用户输入放进 `<a href="...">` 还安全吗？

<details><summary>答案</summary>

不安全。`javascript:alert(1)` 里没有需要转义的字符，点击链接时仍会执行。URL 上下文必须额外校验协议，只允许 `http:` 和 `https:`。

</details>

**Q3.** 为什么说 CSP 是“第二道防线”，而不是 XSS 的主要防御？

<details><summary>答案</summary>

CSP 是在漏洞已经存在的前提下限制脚本执行，策略写得不严格（如允许 `'unsafe-inline'`、允许托管任意内容的 CDN 域名）就会被绕过。而且 CSP 防不住所有危害，比如 HTML 注入导致的钓鱼表单。根本解决仍然要靠正确的输出编码和净化。

</details>

**Q4.** 为什么基于 nonce 的 CSP 比基于域名白名单的 CSP 更推荐？

<details><summary>答案</summary>

域名白名单很容易被绕过：白名单里的 CDN 或域名上只要有一个可以被利用的 JSONP 接口或可上传的文件，就能加载攻击者控制的脚本。nonce 是每次请求随机生成的，攻击者注入的脚本拿不到正确的 nonce。配合 `'strict-dynamic'`，可信脚本动态加载的脚本也能正常运行。

</details>

**Q5.** React 默认就会转义，那么 React 应用里还可能出现 XSS 吗？

<details><summary>答案</summary>

可能。常见原因：使用 `dangerouslySetInnerHTML`；把用户输入放进 `href`（`javascript:` 协议）；直接操作 DOM（`ref.current.innerHTML`）；服务端渲染时把数据序列化进 `<script>` 标签而没有正确转义；以及第三方组件内部的不安全实现。

</details>

## 7. 延伸阅读与练习

- [OWASP Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP DOM based XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [web.dev：Strict CSP](https://web.dev/articles/strict-csp)
- [PortSwigger Academy：Cross-site scripting](https://portswigger.net/web-security/cross-site-scripting)
