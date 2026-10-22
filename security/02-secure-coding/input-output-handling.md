# 输入输出处理（校验、编码、反序列化、文件路径）

> 方向：安全编码 · 相关标准：CWE-20（输入校验不当）、CWE-22（路径遍历）、CWE-434（危险文件上传）、CWE-502（不可信数据反序列化）、OWASP A08:2025 · 最后更新：2026-10-22

## 1. 核心要点

- **入口校验，出口编码**：数据进入系统时按白名单校验格式，数据离开系统（输出到 HTML、SQL、Shell、日志）时按目标上下文编码或参数化。两者都要做，互相不能替代。
- 校验用**白名单**（允许什么），不要用黑名单（禁止什么）。校验在**服务端**完成。
- **不要反序列化不可信数据**：`pickle`、`yaml.load`（非安全模式）、Java 原生序列化、PHP `unserialize` 都可能直接导致代码执行。只用 JSON 这类纯数据格式。
- 文件路径：**不要用用户输入拼路径**。实在需要时，规范化后检查结果是否仍在允许的目录内。
- 文件上传：文件名由服务端生成，类型按内容校验，文件存在 Web 根目录之外或独立的存储里，限制大小。

## 2. 为什么重要

- **成因**：相信客户端已经做过校验；用字符串操作处理路径；为了方便直接序列化对象；按扩展名判断文件类型。
- **影响**：路径遍历可以读到配置文件和密钥；不安全的反序列化通常等于远程代码执行；上传可执行文件到 Web 目录可以导致服务器被控制；超大输入导致拒绝服务。
- **标准**：[CWE-22](https://cwe.mitre.org/data/definitions/22.html)、[CWE-434](https://cwe.mitre.org/data/definitions/434.html)、[CWE-502](https://cwe.mitre.org/data/definitions/502.html)

## 3. 常见错误 vs 正确做法

**用 Schema 做输入校验（Pydantic）**

```python
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class CreateUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")  # 拒绝未定义的字段，顺便防批量赋值

    email: EmailStr
    nickname: str = Field(min_length=1, max_length=32, pattern=r"^[\w\- ]+$")
    age: int = Field(ge=13, le=150)


# 校验失败会抛出 ValidationError，统一返回 400
req = CreateUserRequest.model_validate(request.json)
```

**路径遍历**

```python
import os

UPLOAD_DIR = "/srv/app/uploads"

# 错误：filename = "../../etc/passwd" 就能读到目录外的文件
def read_upload_unsafe(filename):
    with open(os.path.join(UPLOAD_DIR, filename), "rb") as f:
        return f.read()
```

```python
from pathlib import Path

UPLOAD_ROOT = Path("/srv/app/uploads").resolve()


# 正确：规范化（解析 .. 和符号链接）之后，确认结果仍在允许的目录下
def read_upload(filename: str) -> bytes:
    target = (UPLOAD_ROOT / filename).resolve()
    if not target.is_relative_to(UPLOAD_ROOT):
        raise PermissionError("非法路径")
    return target.read_bytes()
```

更好的做法是：数据库里只存服务端生成的文件 ID，用户只能通过 ID 访问，根本不接触路径。

**文件上传**

```python
import uuid
from pathlib import Path

ALLOWED_TYPES = {"image/png": ".png", "image/jpeg": ".jpg"}
MAX_SIZE = 5 * 1024 * 1024


def save_avatar(file_storage) -> str:
    data = file_storage.read(MAX_SIZE + 1)
    if len(data) > MAX_SIZE:
        raise ValueError("文件过大")

    # 按文件内容判断类型，不信任扩展名和客户端提供的 Content-Type
    mime = detect_mime(data)  # 例如用 python-magic 或 Pillow 打开验证
    if mime not in ALLOWED_TYPES:
        raise ValueError("不支持的文件类型")

    # 文件名由服务端生成，存储在 Web 根目录之外
    name = f"{uuid.uuid4().hex}{ALLOWED_TYPES[mime]}"
    (Path("/srv/app/uploads") / name).write_bytes(data)
    return name
```

下载用户上传的文件时，设置 `Content-Disposition: attachment` 和准确的 `Content-Type`，加上 `X-Content-Type-Options: nosniff`。最好用独立的域名提供用户上传的内容，避免与主站同源。

**反序列化**

```python
import pickle
import yaml

# 错误：pickle 可以在反序列化时执行任意代码
obj = pickle.loads(request.data)

# 错误：yaml.load 在不指定 Loader 或使用不安全 Loader 时可以构造任意对象
cfg = yaml.load(text, Loader=yaml.UnsafeLoader)
```

```python
import json
import yaml

# 正确：用纯数据格式，再用 Schema 校验
obj = json.loads(request.data)
cfg = yaml.safe_load(text)
```

如果确实需要在系统之间传递结构化对象，用 JSON / Protocol Buffers，并且对数据做签名（HMAC）防止篡改。

**XML：关闭外部实体**

```python
# 使用 defusedxml 代替标准库解析不可信 XML，防止 XXE 和实体膨胀攻击
from defusedxml.ElementTree import fromstring

root = fromstring(xml_text)
```

**输出到日志：防止日志注入**

```python
# 用户输入中的换行符可以伪造日志行；使用结构化日志（JSON），或者转义控制字符
logger.info("login failed", extra={"username": username})
```

## 4. 如何识别

- 搜索路径操作：`open(`、`os.path.join`、`send_file`、`send_from_directory`、`fs.readFile`、`path.join`，看参数里是否有用户输入。
- 搜索反序列化：`pickle.loads`、`yaml.load(`、`marshal.loads`、`shelve`、`ObjectInputStream`、`unserialize(`、`node-serialize`。
- 检查文件上传：文件名是否来自客户端，类型是否只看扩展名，存储位置是否可以被 Web 直接执行。
- 检查 XML 解析是否禁用了外部实体（DTD）。
- 检查解压缩代码：解压出的文件名可能带 `../`（Zip Slip），解压后的大小可能远大于压缩包（压缩炸弹）。
- 检查是否有输入长度、数量、嵌套深度的限制。

## 5. 防御清单

- [ ] 所有接口用 Schema（Pydantic、Zod、JSON Schema 等）在服务端做白名单校验
- [ ] Schema 拒绝未定义的字段
- [ ] 对字符串长度、数组大小、请求体大小、嵌套深度设置上限
- [ ] 不使用用户输入拼接文件路径；必要时规范化并检查是否在允许目录内
- [ ] 上传文件名由服务端生成，按内容校验类型，限制大小，存储在 Web 根目录之外
- [ ] 用户上传的内容从独立域名提供，设置 `nosniff` 和合适的 `Content-Disposition`
- [ ] 不反序列化不可信数据，只用 JSON 等纯数据格式；YAML 用 `safe_load`
- [ ] 解析 XML 时禁用 DTD 和外部实体
- [ ] 解压缩时检查每个条目的路径和解压后的总大小
- [ ] 输出时按上下文编码（HTML、URL、JavaScript、SQL 参数化、Shell 参数数组）

## 6. 自测题

**Q1.** 已经在前端用 JavaScript 校验了表单，服务端还需要校验吗？

<details><summary>答案</summary>

需要。前端校验只是为了用户体验，攻击者可以直接用工具发请求，完全绕过前端。安全相关的校验必须在服务端完成。

</details>

**Q2.** 用 `filename.replace("../", "")` 防路径遍历有什么问题？

<details><summary>答案</summary>

很容易绕过。例如 `....//` 在替换一次后会变成 `../`；还有 URL 编码、Windows 反斜杠、绝对路径（`/etc/passwd` 直接覆盖了基础路径）、符号链接等情况。正确做法是规范化路径之后，检查最终路径是否在允许的目录下，或者干脆不让用户控制路径。

</details>

**Q3.** 为什么 `pickle.loads` 处理不可信数据很危险？

<details><summary>答案</summary>

pickle 格式可以描述“调用某个可调用对象并传入参数”来重建对象，反序列化时这些调用会被执行。所以构造的 pickle 数据可以在反序列化时执行任意代码。Python 官方文档明确警告不要 unpickle 不可信的数据。

</details>

**Q4.** 判断上传文件类型时，为什么不能只看扩展名或 `Content-Type` 请求头？

<details><summary>答案</summary>

两者都由客户端控制，可以随意伪造。应该检查文件内容（文件头魔数，或者用对应的库尝试解析，比如用 Pillow 打开图片），并且只允许少数明确需要的类型。即便如此，也要把文件存在不会被当作代码执行的位置。

</details>

**Q5.** “入口校验”和“出口编码”为什么要同时做？

<details><summary>答案</summary>

入口校验保证数据符合业务预期（格式、长度、范围），但很多合法数据本身就包含特殊字符，比如名字里的单引号 `O'Brien`、评论里的 `<`。入口无法也不应该把这些都拒绝掉。出口编码保证数据在特定上下文（HTML、SQL、Shell）里只被当作数据。两者解决的是不同的问题。

</details>

## 7. 延伸阅读与练习

- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Deserialization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html)
- [OWASP XML External Entity Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)
- [Python 文档：pickle 的安全警告](https://docs.python.org/3/library/pickle.html)
- [PortSwigger Academy：Path traversal](https://portswigger.net/web-security/file-path-traversal)、[File upload vulnerabilities](https://portswigger.net/web-security/file-upload)、[Insecure deserialization](https://portswigger.net/web-security/deserialization)
