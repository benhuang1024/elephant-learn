# 注入（Injection）

> 方向：Web · 相关标准：OWASP A05:2025、CWE-89（SQL 注入）、CWE-78（OS 命令注入）、CWE-1336（模板注入） · 最后更新：2026-10-22

## 1. 核心要点

- 注入的本质是**数据被当成了代码执行**：不可信的输入被拼接进 SQL、Shell 命令、模板、LDAP 查询等解释器能执行的语句里。
- 根本的防御是**让数据和代码分离**：SQL 用参数化查询，命令执行用参数数组而不是 Shell 字符串，模板只传变量不拼模板。
- 转义和黑名单过滤只能作为补充手段，不能作为主要防御，因为很容易漏掉边界情况。
- ORM 并不能自动防住所有注入，`raw()`、`text()`、字符串格式化拼出来的查询仍然有风险。
- 数据库账号使用最小权限，即使注入成功，也要把影响限制在最小范围。

## 2. 为什么重要

- **成因**：用字符串拼接或格式化构造查询或命令，开发者以为输入会“规规矩矩”。
- **影响**：SQL 注入可以导致数据泄露、篡改、绕过登录，严重时可以执行系统命令；命令注入和模板注入通常直接导致服务器被控制（RCE）。
- **常见形态**：SQL 注入、NoSQL 注入（如 MongoDB 的 `$where`、操作符注入）、OS 命令注入、服务端模板注入（SSTI）、LDAP/XPath 注入、日志注入。
- **标准**：[OWASP A05:2025](https://top10.owasp.org/2025)、[CWE-89](https://cwe.mitre.org/data/definitions/89.html)、[CWE-78](https://cwe.mitre.org/data/definitions/78.html)

## 3. 常见错误 vs 正确做法

**SQL 注入**

```python
# 错误：字符串拼接，输入里的引号会改变 SQL 语句的结构
cur.execute(f"SELECT * FROM users WHERE email = '{email}'")
```

```python
# 正确：参数化查询，驱动会把 email 当作纯数据处理
cur.execute("SELECT * FROM users WHERE email = %s", (email,))
```

```python
# ORM 里同样要注意
from sqlalchemy import text

# 错误
db.session.execute(text(f"SELECT * FROM orders WHERE status = '{status}'"))

# 正确：使用绑定参数
db.session.execute(text("SELECT * FROM orders WHERE status = :status"), {"status": status})
```

**无法参数化的部分（表名、列名、排序方向）用白名单**

```python
SORTABLE_COLUMNS = {"created_at", "price", "name"}


def build_order_by(column: str, direction: str) -> str:
    if column not in SORTABLE_COLUMNS:
        column = "created_at"
    direction = "DESC" if direction.lower() == "desc" else "ASC"
    return f"ORDER BY {column} {direction}"
```

**OS 命令注入**

```python
import subprocess

# 错误：shell=True 时，文件名里的 ; | $() 等字符会被 Shell 解释
subprocess.run(f"convert {filename} out.png", shell=True)
```

```python
# 正确：用参数列表，不经过 Shell；用 -- 结束选项解析，防止以 - 开头的文件名被当作参数
subprocess.run(["convert", "--", filename, "out.png"], check=True)
```

更好的做法是：如果有对应的语言库（比如用 Pillow 处理图片），就不要调用外部命令。

**服务端模板注入（SSTI）**

```python
from flask import render_template_string

# 错误：用户输入成为模板的一部分，模板引擎会执行其中的表达式
render_template_string("<h1>Hello " + name + "</h1>")
```

```python
# 正确：模板固定，用户输入只作为变量传入（同时会被自动转义）
render_template_string("<h1>Hello {{ name }}</h1>", name=name)
```

**NoSQL 操作符注入（Node.js + MongoDB）**

```javascript
// 错误：如果请求体是 {"username": "admin", "password": {"$ne": null}}，查询条件会恒为真
// db.users.findOne({ username: req.body.username, password: req.body.password });

// 正确：确认类型是字符串，并且密码要先哈希再比对，不要直接拿明文去查
function getStringField(body, name) {
  const value = body[name];
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}
```

## 4. 如何识别

- 搜索字符串拼接后传给解释器的地方：
  - Python：`execute(f"`、`execute("..." %`、`.format(` 用于 SQL，`shell=True`、`os.system`、`os.popen`、`render_template_string`、`eval`、`exec`
  - JavaScript：模板字符串拼进 `query(`、`child_process.exec`、`eval`、`new Function`
  - Java：`Statement.executeQuery("..." +`、`Runtime.exec(String)`
- 跟踪数据流：从请求参数出发，看它是否在没有参数化的情况下到达上面这些函数。
- 注意二次注入：数据先被安全地存入数据库，之后又被取出并拼接进另一条查询。
- 用 Semgrep、CodeQL 等工具辅助扫描（见 [安全工具](../02-secure-coding/security-tooling.md)）。

## 5. 防御清单

- [ ] 所有 SQL 使用参数化查询或 ORM 的安全接口
- [ ] 表名、列名、排序方向等无法参数化的部分使用白名单
- [ ] 不使用 `shell=True` / `exec` 执行包含外部输入的命令，优先使用语言内置库
- [ ] 模板固定，用户输入只作为模板变量
- [ ] 禁止在业务代码中对外部输入使用 `eval`、`exec`、`new Function`
- [ ] 对 NoSQL 查询的输入做类型校验，禁止客户端传入查询操作符
- [ ] 数据库账号按最小权限分配，应用账号不能执行 DDL、不能读写无关的库
- [ ] 数据库错误信息不返回给前端
- [ ] 代码审计和 CI 中加入注入相关的 SAST 规则

## 6. 自测题

**Q1.** 为什么参数化查询能防住 SQL 注入，而手动转义引号不够可靠？

<details><summary>答案</summary>

参数化查询把 SQL 语句结构和数据分开发送，数据库先解析语句结构，再把参数作为纯数据填入，参数永远不会改变语句结构。手动转义依赖开发者考虑到所有特殊字符、编码方式和数据库方言，任何一个疏漏都会被绕过，比如数值型参数没有引号包裹时，转义引号根本没用。

</details>

**Q2.** 用户可以选择按哪一列排序，列名能用参数化查询传入吗？应该怎么处理？

<details><summary>答案</summary>

不能。参数化查询只能用于值，不能用于表名、列名、SQL 关键字。应该用白名单：把允许的列名写成固定集合，输入不在集合里时使用默认值或报错。

</details>

**Q3.** 用了 ORM，就一定不会有 SQL 注入吗？

<details><summary>答案</summary>

不一定。ORM 的常规查询接口是安全的，但 `raw()`、`text()`、`extra()`、原生 SQL 片段，以及用字符串格式化构造的过滤条件，都可能引入注入。审计时要专门找这些“逃生口”。

</details>

**Q4.** `subprocess.run(["ping", host])` 还有风险吗？

<details><summary>答案</summary>

不经过 Shell，所以不会出现 `;`、`|` 这类 Shell 元字符注入。但仍然存在参数注入风险：如果 `host` 以 `-` 开头，可能被 `ping` 当作选项解析。应该校验 `host` 是合法的主机名或 IP，并在支持的命令中使用 `--` 结束选项解析。

</details>

**Q5.** 什么是二次注入（Second-order Injection）？

<details><summary>答案</summary>

恶意数据第一次写入时被安全处理（比如用了参数化查询），存进了数据库。之后另一段代码从数据库中取出这条数据，以为“来自自己的数据库就是可信的”，又直接拼接进新的查询，这时注入才真正发生。防御：所有进入解释器的数据都按不可信处理，无论来源是哪里。

</details>

## 7. 延伸阅读与练习

- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP OS Command Injection Defense Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html)
- [OWASP Query Parameterization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html)
- [PortSwigger Academy：SQL injection](https://portswigger.net/web-security/sql-injection)、[OS command injection](https://portswigger.net/web-security/os-command-injection)、[Server-side template injection](https://portswigger.net/web-security/server-side-template-injection)
