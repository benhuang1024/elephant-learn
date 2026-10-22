# 认证与会话（Authentication & Session）

> 方向：Web · 相关标准：OWASP A07:2025、CWE-287、CWE-384（会话固定）、CWE-916（密码哈希强度不足）、NIST SP 800-63B · 最后更新：2026-10-22

## 1. 核心要点

- 密码只存**慢哈希**（Argon2id、scrypt、bcrypt），绝不明文存储，也不要用 MD5/SHA-256 这类快速哈希直接存。
- 登录成功后**重新生成 Session ID**，防止会话固定攻击；登出时在服务端销毁会话。
- Session Cookie 设置 `HttpOnly`、`Secure`、`SameSite`，并设置合理的过期时间。
- JWT 要**固定允许的算法**，必须校验签名、`exp`、`iss`、`aud`。不要把敏感数据放进 JWT 的载荷里，载荷只是 Base64 编码，并没有加密。
- 关键账号和敏感操作启用 MFA，并对登录接口做限速，防止撞库和暴力破解。

## 2. 为什么重要

- **成因**：自研认证流程中细节很多，任何一处疏忽（错误提示区分“用户不存在”和“密码错误”、找回密码令牌可预测、JWT 不验签）都可能导致账号被接管。
- **影响**：账号接管、批量盗号（撞库）、长期潜伏（会话不失效）。
- **常见形态**：弱密码哈希、无登录限速、会话固定、JWT 接受 `alg: none` 或算法混淆、找回密码令牌泄露或不过期。
- **标准**：[OWASP A07:2025](https://top10.owasp.org/2025)、[NIST SP 800-63B](https://pages.nist.gov/800-63-4/)

## 3. 常见错误 vs 正确做法

**密码存储**

```python
import hashlib

# 错误：快速哈希，没有盐，GPU 每秒可以尝试数十亿次
password_hash = hashlib.sha256(password.encode()).hexdigest()
```

```python
# 正确：使用 argon2-cffi，自带随机盐，参数可调
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()  # 默认参数为 Argon2id


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        ph.verify(stored_hash, password)
    except VerifyMismatchError:
        return False
    # 参数升级后，在用户登录时顺便重新哈希
    if ph.check_needs_rehash(stored_hash):
        update_user_hash(ph.hash(password))
    return True
```

**登录后重新生成会话**

```python
from flask import session


def on_login_success(user):
    # 清掉登录前的会话数据，签发新的会话，避免会话固定
    session.clear()
    session["user_id"] = user.id
    session.permanent = True
```

**Cookie 属性（Flask 配置示例）**

```python
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,    # JavaScript 读不到，降低 XSS 窃取风险
    SESSION_COOKIE_SECURE=True,      # 只通过 HTTPS 发送
    SESSION_COOKIE_SAMESITE="Lax",   # 跨站请求默认不带 Cookie
    PERMANENT_SESSION_LIFETIME=60 * 60 * 8,
)
```

**JWT 校验（PyJWT）**

```python
import jwt

# 错误：不验签就读取载荷
claims = jwt.decode(token, options={"verify_signature": False})
```

```python
# 正确：固定算法，校验签名、过期时间、签发方和受众
claims = jwt.decode(
    token,
    key=PUBLIC_KEY,
    algorithms=["RS256"],          # 只接受预期的算法
    audience="https://api.example.com",
    issuer="https://auth.example.com",
    options={"require": ["exp", "iss", "aud", "sub"]},
)
```

**登录失败的提示**

```python
# 错误：分别提示“用户不存在”和“密码错误”，可以被用来枚举有效账号
# 正确：统一提示，并对不存在的用户也做一次哈希校验，让两种情况的响应时间一致
GENERIC_ERROR = "用户名或密码错误"
```

## 4. 如何识别

- 搜索密码相关代码：`md5(`、`sha1(`、`sha256(` 出现在密码处理附近就要警惕。
- 检查登录接口：有没有限速或锁定，错误提示是否统一，登录成功后是否重新生成会话。
- 检查 Cookie：浏览器开发者工具的 Application 面板里，看 Session Cookie 是否有 `HttpOnly`、`Secure`、`SameSite`。
- 检查 JWT：解码 `verify_signature=False`、`algorithms` 参数缺失或接受多种算法、密钥硬编码或强度很弱、没有过期时间。
- 检查找回密码流程：令牌是否用 CSPRNG 生成，是否一次性、是否短期过期，修改密码后其他会话是否失效。

## 5. 防御清单

- [ ] 密码使用 Argon2id / scrypt / bcrypt 存储
- [ ] 密码策略参考 NIST：最小长度不低于 8 位（建议支持 64 位以上），检查是否在已泄露密码库中，不强制定期更换
- [ ] 登录、注册、找回密码接口有限速和异常检测
- [ ] 登录失败提示统一，不泄露账号是否存在
- [ ] 登录成功、权限变化时重新生成会话 ID
- [ ] 登出和修改密码时在服务端使会话失效
- [ ] Session Cookie 设置 `HttpOnly`、`Secure`、`SameSite`
- [ ] JWT 固定算法，校验签名、`exp`、`iss`、`aud`，密钥足够强且不硬编码
- [ ] 找回密码令牌随机、一次性、短期有效，只存储令牌的哈希值
- [ ] 管理员和高权限账号强制 MFA，优先支持 TOTP 或 WebAuthn/Passkey

## 6. 自测题

**Q1.** 为什么不能用 SHA-256 加盐来存储密码？

<details><summary>答案</summary>

SHA-256 是为“快”设计的，GPU 每秒可计算数十亿次。盐只能防彩虹表，不能减慢对单个哈希的暴力破解。Argon2id、scrypt、bcrypt 是专门设计的慢哈希，有可调的计算成本（Argon2id 和 scrypt 还有内存成本），能大幅提高离线破解的代价。

</details>

**Q2.** 什么是会话固定攻击？怎么防？

<details><summary>答案</summary>

攻击者先拿到一个有效的会话 ID，然后诱导受害者用这个 ID 登录。如果服务端在登录后没有更换会话 ID，攻击者就可以用同一个 ID 冒充受害者。防御：登录成功后清除旧会话并签发新的会话 ID。

</details>

**Q3.** `HttpOnly` 能防止 XSS 吗？

<details><summary>答案</summary>

不能防止 XSS 本身，只能防止脚本通过 `document.cookie` 读取 Cookie。攻击者的脚本仍然可以在受害者的页面里以受害者身份发起请求。修复 XSS 要靠输出编码和 CSP，`HttpOnly` 只是减轻影响的手段。

</details>

**Q4.** 服务端解码 JWT 时没有指定 `algorithms` 参数，可能有什么风险？

<details><summary>答案</summary>

如果库根据令牌头部的 `alg` 字段选择算法，攻击者可以把算法改成 `none` 跳过签名，或者在 RS256 场景下改成 HS256，用公钥当作 HMAC 密钥伪造签名（算法混淆）。所以必须在服务端固定允许的算法。现在主流库大多要求显式传入 `algorithms`，但仍要确认。

</details>

**Q5.** 用户修改密码后，应该怎么处理已有的会话和令牌？

<details><summary>答案</summary>

应该让该用户其他设备上的会话失效（可以保留当前会话），撤销已签发的刷新令牌。如果使用无状态 JWT，可以通过缩短访问令牌有效期、维护令牌版本号或撤销列表来实现。否则攻击者偷到的旧会话在改密后仍然有效。

</details>

## 7. 延伸阅读与练习

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)（示例是 Java，原理通用）
- [PortSwigger Academy：Authentication](https://portswigger.net/web-security/authentication)、[JWT attacks](https://portswigger.net/web-security/jwt)
