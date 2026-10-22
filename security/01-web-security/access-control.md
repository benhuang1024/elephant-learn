# 访问控制（Broken Access Control）

> 方向：Web · 相关标准：OWASP A01:2025、CWE-284、CWE-639（IDOR）、CWE-862（缺少授权） · 最后更新：2026-10-22

## 1. 核心要点

- **认证 ≠ 授权**。认证回答“你是谁”，授权回答“你能不能做这件事”。登录了不代表什么都能访问。
- 授权检查**必须在服务端**完成，而且要放在**每一个**接口上。前端隐藏按钮不算防护。
- 不要信任客户端传来的身份和角色信息（如 `user_id`、`role=admin`），这些只能从服务端的会话或已校验的令牌里取。
- **默认拒绝**：没有明确允许的操作一律不允许。
- 把授权逻辑集中到一处（中间件、装饰器、策略层），不要在每个接口里各写各的。

## 2. 为什么重要

- **成因**：开发者只验证了用户已登录，却没有验证用户和被操作对象之间的归属关系。或者只在前端控制菜单可见性，后端接口没有任何检查。
- **影响**：读取或修改别人的数据（订单、病历、私信），普通用户执行管理员操作，批量拉取全部数据。在 2025 版 Top 10 里排第一。
- **常见形态**：
  - **水平越权 / IDOR**：把 URL 里的 `/orders/1001` 改成 `/orders/1002`，就看到了别人的订单
  - **垂直越权**：普通用户直接请求 `/admin/users` 也能成功
  - **批量赋值（Mass Assignment）**：提交表单时多带一个 `is_admin=true` 字段，后端直接写进数据库
- **标准**：[OWASP A01:2025](https://top10.owasp.org/2025)、[CWE-639](https://cwe.mitre.org/data/definitions/639.html)

## 3. 常见错误 vs 正确做法

**IDOR：只按 ID 查询，不检查归属**

```python
# 错误：任何登录用户只要知道 ID 就能读取任意订单
@app.get("/orders/<int:order_id>")
@login_required
def get_order(order_id):
    order = Order.query.get_or_404(order_id)
    return order.to_dict()
```

```python
# 正确：查询条件里带上当前用户，查不到时统一返回 404，不泄露“订单存在但不是你的”
@app.get("/orders/<int:order_id>")
@login_required
def get_order(order_id):
    order = Order.query.filter_by(id=order_id, owner_id=current_user.id).first_or_404()
    return order.to_dict()
```

**垂直越权：角色检查集中处理**

```python
from functools import wraps
from flask import abort


def require_role(role):
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            # 角色只从服务端会话里取，不看请求参数
            if role not in current_user.roles:
                abort(403)
            return view(*args, **kwargs)
        return wrapper
    return decorator


@app.post("/admin/users/<int:user_id>/disable")
@login_required
@require_role("admin")
def disable_user(user_id):
    ...
```

**批量赋值：只接受白名单字段**

```python
# 错误：把请求体整个更新到模型上，攻击者可以多传 is_admin、balance 等字段
user.update(**request.json)

# 正确：明确列出允许用户修改的字段
ALLOWED_PROFILE_FIELDS = {"nickname", "avatar_url", "bio"}
changes = {k: v for k, v in request.json.items() if k in ALLOWED_PROFILE_FIELDS}
user.update(**changes)
```

## 4. 如何识别

- 找出所有接收对象 ID 的接口（路径参数、查询参数、请求体），逐个确认查询时有没有带上归属条件。
- 检查是否存在只有前端控制的权限：菜单、按钮被隐藏了，但对应的 API 没有鉴权装饰器。
- 搜索 `update(**`、`Object.assign(model, req.body)`、`BeanUtils.copyProperties` 这类整体赋值的写法。
- 看鉴权逻辑是不是分散在各个接口里，分散的地方最容易漏。
- 自测方法：准备两个普通账号 A、B 和一个管理员账号。用 A 的会话去请求 B 的资源、请求管理员接口，看是否都被拒绝。

## 5. 防御清单

- [ ] 除了明确的公开接口，所有接口默认需要登录
- [ ] 所有按 ID 访问资源的查询都带上归属或权限条件
- [ ] 角色和权限只从服务端会话或已校验的令牌中读取
- [ ] 鉴权逻辑集中在中间件、装饰器或策略层，新接口默认继承
- [ ] 写入接口使用字段白名单，拒绝未知字段
- [ ] 无权访问时统一返回 403 或 404，不泄露资源是否存在
- [ ] 对外暴露的 ID 考虑用不可枚举的 UUID（这是补充手段，**不能替代**授权检查）
- [ ] 访问控制失败要记日志，同一账号短时间内大量 403 要能触发告警
- [ ] 为越权场景编写自动化测试：用户 A 访问用户 B 的资源必须失败

## 6. 自测题

**Q1.** 把订单 ID 从自增整数改成 UUID 之后，还需要做归属检查吗？为什么？

<details><summary>答案</summary>

需要。UUID 只是让 ID 难以猜测，但 ID 仍可能通过分享链接、日志、Referer 头、其他接口的返回值等途径泄露。授权必须基于“当前用户是否有权访问这个对象”，而不是“对方猜不到 ID”。

</details>

**Q2.** 前端已经根据角色隐藏了“删除用户”按钮，后端接口还需要做角色检查吗？

<details><summary>答案</summary>

必须做。攻击者可以绕过前端，直接用 curl 或代理工具构造请求。前端控制只影响用户体验，不构成安全边界。

</details>

**Q3.** 用户无权访问某个订单时，返回 403 和返回 404 各有什么考虑？

<details><summary>答案</summary>

403 明确告诉对方“资源存在但你没有权限”，这会泄露资源是否存在的信息。404 不泄露这一点，常用于用户私有的资源。管理后台这类场景中，用户知道资源存在是合理的，用 403 更便于排查问题。两者的选择要在系统内保持一致。

</details>

**Q4.** 什么是批量赋值漏洞？给出一种防御方式。

<details><summary>答案</summary>

后端把请求体里的所有字段直接映射到数据模型上，攻击者就可以额外提交本不该由用户修改的字段（如 `role`、`is_admin`、`balance`）。防御方式：使用显式的字段白名单，或者使用只包含可修改字段的 DTO/Schema 做反序列化。

</details>

**Q5.** 为什么推荐把授权逻辑集中到中间件或策略层？

<details><summary>答案</summary>

分散在各个接口里的检查很容易在新增接口时被遗漏，也难以统一审计。集中处理可以做到“默认拒绝”：新接口自动继承检查，例外情况需要显式声明，审计时只需要看一处。

</details>

## 7. 延伸阅读与练习

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Mass Assignment Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html)
- [PortSwigger Academy：Access control vulnerabilities](https://portswigger.net/web-security/access-control)
- OWASP Juice Shop 中与访问控制相关的挑战
