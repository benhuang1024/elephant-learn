# 密码学的正确使用

> 方向：安全编码 · 相关标准：OWASP A04:2025（加密失败）、CWE-327（使用有缺陷的算法）、CWE-330（随机性不足）、CWE-321（硬编码密钥） · 最后更新：2026-10-22

## 1. 核心要点

- **不要自己设计加密方案**，用成熟库的高层接口（如 Python 的 `cryptography`、libsodium/PyNaCl、Go 标准库、Google Tink）。
- 加密优先使用 **AEAD**（AES-GCM、ChaCha20-Poly1305），它同时提供保密性和完整性。不要用 ECB 模式，不要用不带认证的 CBC。
- **Nonce/IV 不能重复**：AES-GCM 在同一个密钥下重复使用 nonce 会导致严重的安全问题。
- 安全相关的随机数只用 **CSPRNG**（Python `secrets`、`os.urandom`；Node `crypto.randomBytes`；Go `crypto/rand`），不要用 `random`、`Math.random()`。
- 用对工具：**密码**用慢哈希（Argon2id 等），**完整性校验**用 HMAC，**数据加密**用 AEAD，**传输**用 TLS。哈希不是加密，Base64 更不是加密。

## 2. 为什么重要

- **成因**：密码学 API 很容易“用起来能跑，但其实不安全”：ECB 模式能加解密，`random` 能生成令牌，MD5 能算哈希，没有任何报错。
- **影响**：数据泄露后可以被直接解密或破解；令牌可以被预测；签名可以被伪造；数据可以被篡改而不被发现。
- **标准**：[OWASP A04:2025](https://top10.owasp.org/2025)、[CWE-327](https://cwe.mitre.org/data/definitions/327.html)、[CWE-330](https://cwe.mitre.org/data/definitions/330.html)

## 3. 常见错误 vs 正确做法

**选对工具**

| 需求 | 推荐 | 不要用 |
| --- | --- | --- |
| 存储用户密码 | Argon2id、scrypt、bcrypt | MD5、SHA-1、SHA-256（直接哈希） |
| 加密数据 | AES-256-GCM、ChaCha20-Poly1305 | ECB 模式、DES、3DES、RC4、不带 MAC 的 CBC |
| 校验数据没被篡改 | HMAC-SHA256、签名 | 普通哈希（攻击者改了数据可以重算哈希） |
| 数字签名 | Ed25519、ECDSA P-256、RSA-PSS（≥3072 位） | RSA PKCS#1 v1.5 用于新设计、过短的 RSA 密钥 |
| 生成令牌和密钥 | `secrets`、`os.urandom`、`crypto.randomBytes` | `random`、`Math.random()`、时间戳 |
| 从口令派生密钥 | Argon2id、scrypt、PBKDF2（高迭代次数） | 直接哈希口令当密钥 |

**随机数**

```python
import random
import secrets

# 错误：random 是可预测的伪随机数生成器（Mersenne Twister），观察足够多的输出就能推算后续结果
token = "".join(random.choices("abcdef0123456789", k=32))

# 正确：secrets 使用操作系统提供的 CSPRNG
token = secrets.token_urlsafe(32)
```

```javascript
const crypto = require("node:crypto");

// 错误：Math.random() 不是密码学安全的
// const token = Math.random().toString(36).slice(2);

// 正确
const token = crypto.randomBytes(32).toString("base64url");
```

**对称加密（Python `cryptography` 库）**

```python
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

key = AESGCM.generate_key(bit_length=256)  # 实际应从 KMS 或密钥管理服务获取，不要硬编码
aesgcm = AESGCM(key)


def encrypt(plaintext: bytes, associated_data: bytes) -> bytes:
    nonce = os.urandom(12)  # 每次加密都生成新的 nonce
    return nonce + aesgcm.encrypt(nonce, plaintext, associated_data)


def decrypt(blob: bytes, associated_data: bytes) -> bytes:
    nonce, ciphertext = blob[:12], blob[12:]
    # 密文或关联数据被篡改时会抛出 InvalidTag
    return aesgcm.decrypt(nonce, ciphertext, associated_data)
```

`associated_data` 可以绑定上下文（如用户 ID、字段名），防止攻击者把 A 用户的密文挪给 B 用户使用。

如果不想处理 nonce 这类细节，可以用更高层的方案，如 `cryptography` 库的 `Fernet`，或者 Google Tink。

**比较 MAC 和令牌时用常量时间比较**

```python
import hashlib
import hmac


def verify_signature(secret: bytes, body: bytes, received_sig: str) -> bool:
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    # 普通的 == 在遇到第一个不同字符时就返回，可能泄露时间信息
    return hmac.compare_digest(expected, received_sig)
```

**TLS 证书校验**

```python
import requests

# 错误：关闭证书校验，任何中间人都可以冒充服务端
requests.get("https://api.example.com", verify=False)

# 正确：保持默认校验；使用内部 CA 时指定 CA 证书
requests.get("https://internal.example.com", verify="/etc/ssl/internal-ca.pem")
```

## 4. 如何识别

- 搜索弱算法：`md5`、`sha1`（用于安全场景时）、`DES`、`RC4`、`ECB`、`AES.MODE_ECB`、`createCipher(`（Node 中已移除的旧接口）。
- 搜索不安全的随机数：`random.`、`Math.random`、`rand.Intn`（Go 的 `math/rand`），看它们是否被用于生成令牌、密码、验证码、ID。
- 搜索关闭证书校验：`verify=False`、`rejectUnauthorized: false`、`InsecureSkipVerify: true`、`CERT_NONE`。
- 检查密钥来源：是否硬编码在代码里、是否所有环境共用一个密钥。
- 检查 nonce/IV 的生成方式：是否固定值、是否用计数器但在多个进程间可能重复。
- 检查令牌和签名的比较是否用了常量时间比较。

## 5. 防御清单

- [ ] 使用成熟库的高层接口，不自己实现加密算法或协议
- [ ] 数据加密使用 AEAD（AES-GCM / ChaCha20-Poly1305），每次加密使用新的随机 nonce
- [ ] 安全相关的随机数全部使用 CSPRNG
- [ ] 密码使用 Argon2id / scrypt / bcrypt 存储
- [ ] 完整性校验使用 HMAC 或数字签名，比较时使用常量时间比较
- [ ] 不在生产代码中关闭 TLS 证书校验
- [ ] 密钥来自 KMS 或密钥管理服务，不硬编码，按环境区分，支持轮换（见 [密钥管理](secrets-management.md)）
- [ ] 密文中带上密钥版本号，便于密钥轮换后仍能解密旧数据
- [ ] 传输层统一使用 TLS 1.2 及以上版本（推荐 TLS 1.3）
- [ ] 关注后量子密码迁移：了解 ML-KEM、ML-DSA 等新标准，盘点系统中使用的公钥算法

## 6. 自测题

**Q1.** 为什么说 ECB 模式不安全？

<details><summary>答案</summary>

ECB 把明文按块分别独立加密，相同的明文块会得到相同的密文块。所以密文会暴露明文的结构和重复模式（经典例子是用 ECB 加密的图片仍然能看出轮廓），攻击者还可以重排、替换密文块。

</details>

**Q2.** 哈希、加密、编码有什么区别？

<details><summary>答案</summary>

编码（如 Base64）是可逆的格式转换，不需要密钥，没有任何安全性。加密是用密钥进行的可逆变换，有密钥才能解密，用于保密。哈希是单向的，无法从结果还原输入，用于完整性校验和指纹（存储密码时要用专门的慢哈希）。

</details>

**Q3.** 为什么验证 Webhook 签名时要用 `hmac.compare_digest` 而不是 `==`？

<details><summary>答案</summary>

`==` 比较字符串时，一旦遇到不同的字符就会提前返回，比较耗时和“前面有多少个字符是对的”有关。攻击者理论上可以通过测量响应时间逐个字符地猜出正确的签名。`compare_digest` 的耗时与内容无关，避免了这种时序侧信道。

</details>

**Q4.** AES-GCM 重复使用 nonce 会怎样？

<details><summary>答案</summary>

在同一密钥下用同一个 nonce 加密两条消息，攻击者可以得到两条明文的异或值，从而可能恢复明文；更严重的是可以恢复认证密钥，进而伪造任意密文的认证标签。所以 nonce 必须保证唯一，通常用 96 位随机值，或者使用可靠的计数器。

</details>

**Q5.** 已经用了 HTTPS，数据库里的敏感字段还需要加密吗？

<details><summary>答案</summary>

HTTPS 只保护传输过程。数据库备份泄露、SQL 注入、运维人员越权访问、存储介质丢失时，HTTPS 都没有作用。对身份证号、银行卡号这类高敏感字段，应该做字段级加密，密钥由 KMS 管理，并且与数据库分开存放。

</details>

## 7. 延伸阅读与练习

- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP Transport Layer Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)
- [Python `cryptography` 文档](https://cryptography.io/)
- [Google Tink](https://developers.google.com/tink)
- [NIST 后量子密码标准（FIPS 203/204/205）](https://csrc.nist.gov/projects/post-quantum-cryptography)
- [CryptoPals](https://cryptopals.com/)：通过亲手实现来理解密码学错误用法的经典练习
- [picoCTF](https://picoctf.org/) 的 Cryptography 分类
