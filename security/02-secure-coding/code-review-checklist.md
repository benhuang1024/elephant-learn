# 代码安全审计清单

> 方向：安全编码 · 相关标准：OWASP ASVS、OWASP Code Review Guide、CWE Top 25 · 最后更新：2026-10-22

## 1. 核心要点

- 审计不是逐行通读，而是**先建立模型再找重点**：系统有哪些入口、哪里是信任边界、敏感数据和危险操作在哪里。
- 主线是**数据流**：从 Source（不可信输入）跟踪到 Sink（危险操作），检查中间有没有合适的校验、编码或参数化。
- 第二条主线是**控制流**：每个敏感操作之前，是否检查了认证和授权。
- 工具负责**广度**（找出所有可疑点），人负责**深度**（判断业务逻辑、权限模型这些工具不懂的问题）。
- 每个发现都要写清楚：**位置、成因、影响、复现条件、修复建议**，并且标注 CWE 编号。

## 2. 为什么重要

- **成因**：很多漏洞（尤其是越权、业务逻辑缺陷）在代码层面看起来“没有任何错误”，只有理解了业务和信任边界才能发现。
- **价值**：在代码合并前发现问题，修复成本远低于上线后；审计过程本身也是学习安全知识最有效的方式之一。
- **标准**：[OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) 提供了可以逐条对照的验证项。

## 3. 常见错误 vs 正确做法

**审计方法**

| 常见错误 | 正确做法 |
| --- | --- |
| 从第一个文件开始逐行读 | 先看路由表、中间件、配置，画出入口和信任边界 |
| 只跑一遍扫描工具，看报告就结束 | 工具结果作为线索，人工确认并补充业务逻辑检查 |
| 只看新增的代码 | 新增代码要结合被它调用的旧代码和它改变的权限边界一起看 |
| 发现问题只写“这里有 SQL 注入” | 写清楚触发路径、影响、复现条件和具体修复方案 |

**Source 和 Sink 示例（Python Web 应用）**

```python
# Source：不可信输入的来源
request.args, request.form, request.json, request.headers, request.cookies
request.files                      # 文件名和文件内容都不可信
os.environ                         # 在某些部署环境里可能被外部影响
# 以及：消息队列、第三方 API 的响应、数据库里由用户写入的数据

# Sink：危险操作
cursor.execute(...)                # SQL
subprocess.run(..., shell=True)    # 命令执行
eval(...), exec(...)               # 代码执行
pickle.loads(...), yaml.load(...)  # 反序列化
open(path), send_file(path)        # 文件读写
requests.get(url)                  # 服务端发起请求
render_template_string(...)        # 模板
redirect(url)                      # 重定向
```

## 4. 如何识别（审计步骤）

**第一步：理解系统**

- 这个系统做什么？有哪些用户角色？最值钱的数据和操作是什么？
- 入口有哪些：HTTP 路由、消息消费者、定时任务、CLI、文件导入
- 外部依赖有哪些：数据库、缓存、第三方 API、对象存储

**第二步：检查全局机制**

- 认证：在哪里实现？哪些路由跳过了认证？
- 授权：集中实现还是分散实现？有没有默认拒绝？
- 输入处理：有没有统一的 Schema 校验？
- 输出编码：模板引擎是否默认转义？
- 错误处理：是否会泄露细节？异常时是否 fail closed？
- 配置：调试开关、密钥、CORS、Cookie 属性

**第三步：数据流追踪**

- 搜索所有 Sink，逆向追溯参数是否来自 Source
- 或者从关键 Source 出发，正向追踪数据流向

**第四步：逐类检查**

- [ ] 访问控制：每个按 ID 访问资源的地方都有归属检查（见 [访问控制](../01-web-security/access-control.md)）
- [ ] 注入：SQL、命令、模板、NoSQL（见 [注入](../01-web-security/injection.md)）
- [ ] XSS：关闭转义的地方、危险的 DOM 接口（见 [XSS 与 CSP](../01-web-security/xss-csp.md)）
- [ ] SSRF：服务端请求的 URL 来源（见 [SSRF](../01-web-security/ssrf.md)）
- [ ] 文件操作：路径拼接、上传类型和存储位置（见 [输入输出处理](input-output-handling.md)）
- [ ] 反序列化：`pickle`、`yaml.load`、Java 原生反序列化
- [ ] 密码学：算法选择、随机数、密钥来源（见 [密码学使用](crypto-usage.md)）
- [ ] 密钥：硬编码的密码、令牌、私钥（见 [密钥管理](secrets-management.md)）
- [ ] 业务逻辑：负数金额、重复提交、并发竞争、步骤跳过、优惠券叠加
- [ ] 日志：敏感数据是否被记录，安全事件是否被记录

**第五步：记录发现**

```markdown
### [高] 订单详情接口存在越权访问（CWE-639）

- 位置：app/orders/views.py:42 `get_order`
- 成因：按 order_id 查询时没有限制 owner_id
- 影响：任意登录用户可以读取所有用户的订单，包括地址和手机号
- 复现：用户 A 登录后请求 GET /orders/{用户 B 的订单 ID}，返回 200 和订单详情
- 修复：查询条件增加 owner_id=current_user.id；在授权中间件中补充越权测试
```

## 5. 防御清单

把审计变成团队流程：

- [ ] 涉及认证、授权、支付、文件处理、加密的改动，必须有熟悉安全的人参与评审
- [ ] Pull Request 模板中加入安全自查项（是否新增入口？是否处理不可信输入？是否改了权限？）
- [ ] CI 中运行 SAST、依赖扫描、秘密扫描（见 [安全工具](security-tooling.md)）
- [ ] 每个已修复的漏洞都补一个回归测试
- [ ] 维护项目的“危险函数清单”和对应的安全替代写法
- [ ] 重大功能上线前做威胁建模（STRIDE：仿冒、篡改、抵赖、信息泄露、拒绝服务、权限提升）

## 6. 自测题

**Q1.** 什么是 Source 和 Sink？为什么审计时常从 Sink 开始反推？

<details><summary>答案</summary>

Source 是不可信数据进入系统的位置（请求参数、请求头、文件、外部 API 响应等），Sink 是使用数据执行危险操作的位置（SQL 执行、命令执行、文件读写、反序列化等）。Sink 的数量通常比 Source 少得多，而且更容易用搜索找全，所以从 Sink 反推“参数是否可控”效率更高。

</details>

**Q2.** 为什么扫描工具很难发现越权漏洞？

<details><summary>答案</summary>

越权漏洞的代码在语法和数据流上通常都“正常”：参数化查询、没有危险函数。问题在于业务语义——查询少了一个归属条件。工具不知道“这个订单应该只有它的主人能看”，需要人结合业务和权限模型来判断。

</details>

**Q3.** 数据库里取出的数据可以视为可信数据吗？

<details><summary>答案</summary>

不能一概而论。如果数据最初来自用户输入（用户名、评论、文件名），它仍然是不可信的，输出到页面时要编码，拼进查询时要参数化，否则会导致存储型 XSS 或二次注入。判断可信与否要看数据的最初来源，而不是它当前存在哪里。

</details>

**Q4.** 列举三种常见的业务逻辑漏洞。

<details><summary>答案</summary>

例如：下单时数量或金额传负数导致退款或余额增加；并发请求重复领取优惠券或重复提现（竞态条件）；多步骤流程（如找回密码、支付）可以跳过中间步骤直接请求最后一步；客户端提交价格而服务端没有重新计算。

</details>

**Q5.** 一份合格的漏洞报告应该包含哪些内容？

<details><summary>答案</summary>

标题与严重等级、CWE 分类、代码位置、成因说明、影响范围、复现步骤（前置条件和请求示例）、修复建议（最好有示例代码），必要时附上参考资料。目标是让开发者不需要再来问你就能理解并修复。

</details>

## 7. 延伸阅读与练习

- [OWASP Code Review Guide](https://owasp.org/www-project-code-review-guide/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)
- 练习：克隆 [OWASP Juice Shop](https://github.com/juice-shop/juice-shop) 的源码，选 3 个挑战，先在应用中完成，再到源码里找到对应的问题代码，并按上面的格式写报告
