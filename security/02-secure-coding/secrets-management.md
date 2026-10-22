# 密钥与敏感凭证管理

> 方向：安全编码 · 相关标准：CWE-798（硬编码凭证）、CWE-312（明文存储敏感信息）、CWE-532（日志中包含敏感信息）、OWASP A04:2025 · 最后更新：2026-10-22

## 1. 核心要点

- **密钥不进代码、不进仓库、不进镜像**。代码仓库会被复制、Fork、备份，进去了就很难彻底清除。
- 使用**集中的密钥管理服务**（如 HashiCorp Vault、AWS Secrets Manager、GCP Secret Manager、Azure Key Vault），运行时获取。
- 优先使用**短期凭证和工作负载身份**（如云上的实例角色、OIDC 联合身份），尽量不用长期的静态密钥。
- 每个服务、每个环境使用**独立的凭证**，权限最小，能单独轮换和吊销。
- 密钥泄露后的第一件事是**吊销并更换**，而不是删除提交记录。删除历史只是善后，不能替代吊销。

## 2. 为什么重要

- **成因**：图方便把密钥写进配置文件；`.env` 被误提交；调试时把令牌打进日志；Docker 镜像层里残留了密钥；CI 日志打印了环境变量。
- **影响**：公开仓库里的云密钥可能在几分钟内被自动化工具发现并滥用，导致数据泄露、资源被用来挖矿、高额账单。
- **标准**：[CWE-798](https://cwe.mitre.org/data/definitions/798.html)、[CWE-532](https://cwe.mitre.org/data/definitions/532.html)

## 3. 常见错误 vs 正确做法

**代码中的密钥**

```python
# 错误：硬编码
STRIPE_KEY = "sk_live_xxxxxxxxxxxxxxxx"
DB_URL = "postgresql://admin:P@ssw0rd@db.internal/prod"
```

```python
import os

# 可以接受：从环境变量读取（环境变量由部署平台从密钥管理服务注入）
STRIPE_KEY = os.environ["STRIPE_KEY"]
```

```python
import boto3

# 更好：运行时从密钥管理服务获取，凭证本身来自实例角色，不需要任何静态密钥
def get_db_password() -> str:
    client = boto3.client("secretsmanager")
    resp = client.get_secret_value(SecretId="prod/app/db-password")
    return resp["SecretString"]
```

**.gitignore 和示例配置**

```gitignore
.env
.env.*
!.env.example
*.pem
*.key
```

仓库里只放 `.env.example`，里面写变量名和假的占位值，说明每个变量的用途。

**Docker 镜像**

```dockerfile
# 错误：密钥会永久留在镜像层里，即使后面的指令删除了文件
# COPY .npmrc /root/.npmrc
# RUN npm ci && rm /root/.npmrc

# 正确：使用 BuildKit 的 secret 挂载，密钥不会进入任何镜像层
# 构建命令：docker build --secret id=npmrc,src=$HOME/.npmrc .
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```

**CI 中使用短期凭证（GitHub Actions + AWS OIDC）**

```yaml
permissions:
  id-token: write   # 允许获取 OIDC 令牌
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy
          aws-region: us-east-1
      # 后续步骤使用的是有效期很短的临时凭证，仓库里不需要保存任何 AWS 密钥
```

**日志脱敏**

```python
import logging

SENSITIVE_KEYS = {"password", "token", "authorization", "secret", "api_key", "cookie"}


def redact(data: dict) -> dict:
    return {k: ("***" if k.lower() in SENSITIVE_KEYS else v) for k, v in data.items()}


logging.getLogger(__name__).info("request", extra={"headers": redact(dict(request.headers))})
```

## 4. 如何识别

- 用秘密扫描工具扫描当前代码**和完整的 Git 历史**：`gitleaks git .`、`trufflehog git file://.`（见 [安全工具](security-tooling.md)）。
- 搜索关键词：`password =`、`secret`、`api_key`、`token`、`BEGIN RSA PRIVATE KEY`、`AKIA`（AWS 访问密钥前缀）、`sk_live_`、`ghp_`。
- 检查 Docker 镜像历史：`docker history --no-trunc <image>`，看构建指令里有没有密钥。
- 检查 CI 配置：密钥是否用平台的加密变量，日志里是否会打印出来，是否在 Pull Request（尤其是来自 Fork 的）中暴露。
- 检查日志：搜索日志中是否出现 `Authorization`、`password`、完整的令牌。

## 5. 防御清单

- [ ] 代码、配置文件、镜像中不包含任何密钥
- [ ] `.gitignore` 包含 `.env`、私钥等文件，仓库只保留 `.env.example`
- [ ] 开启 pre-commit 秘密扫描，并在 CI 中再扫描一次
- [ ] 开启代码托管平台的秘密扫描和推送保护（如 GitHub Secret Scanning、Push Protection）
- [ ] 密钥存放在密钥管理服务中，运行时获取
- [ ] 优先使用工作负载身份和 OIDC，避免长期静态密钥
- [ ] 每个服务、每个环境使用独立凭证，并且只授予最小权限
- [ ] 制定轮换周期，并验证轮换过程不会导致服务中断
- [ ] 日志和错误信息中对敏感字段做脱敏
- [ ] 准备好泄露处置流程（见下方）

**密钥泄露处置流程**

1. **立即吊销/更换**泄露的密钥（这是第一步，不要等）
2. 检查该密钥的使用日志（如 AWS CloudTrail），确认泄露期间是否被滥用
3. 评估影响范围，按需通知相关方
4. 清理仓库历史（`git filter-repo`），并通知所有协作者重新克隆
5. 复盘：为什么会泄露？补上对应的防护（扫描、推送保护、改用短期凭证）

## 6. 自测题

**Q1.** 发现密钥被提交到了公开仓库，先删除提交记录还是先吊销密钥？为什么？

<details><summary>答案</summary>

先吊销。公开仓库的内容可能已经被自动化工具抓取、被 Fork 或缓存，删除历史无法保证密钥没有被获取。只有吊销才能让泄露的密钥失效。清理历史是之后的善后工作。

</details>

**Q2.** 在 Dockerfile 中 `COPY` 了密钥文件，然后在下一条 `RUN` 里删掉它，镜像里还有密钥吗？

<details><summary>答案</summary>

有。镜像由多层组成，每一层都会被保存下来。`COPY` 那一层里仍然包含这个文件，任何拿到镜像的人都可以提取出来。应该使用 BuildKit 的 `--mount=type=secret`，或者多阶段构建，并且确保最终镜像中不包含构建时用到的密钥。

</details>

**Q3.** 环境变量存放密钥是否就绝对安全？

<details><summary>答案</summary>

比硬编码好，但有局限：环境变量可能被调试页面、错误报告、崩溃转储、`/proc/<pid>/environ` 读到，也可能被子进程继承，或被 CI 日志打印出来。更好的做法是从密钥管理服务按需获取，或者以文件形式挂载，并限制访问权限。

</details>

**Q4.** 为什么推荐用 OIDC 联合身份代替在 CI 中保存云平台的访问密钥？

<details><summary>答案</summary>

OIDC 方式下，CI 每次运行时用平台签发的身份令牌换取有效期很短的临时凭证，仓库中不保存长期密钥，也就不存在“长期密钥泄露”的问题。还可以在云端的信任策略中限制只有特定仓库、特定分支才能获取凭证。

</details>

**Q5.** 如何避免密钥出现在日志中？

<details><summary>答案</summary>

使用结构化日志，并在日志处理层统一对敏感字段（`password`、`token`、`Authorization`、`Cookie` 等）脱敏；不要整体记录请求头和请求体；错误处理时不把包含连接串的异常信息原样输出；CI 中使用平台的掩码功能；定期抽查日志。

</details>

## 7. 延伸阅读与练习

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [GitHub：Secret scanning](https://docs.github.com/en/code-security/secret-scanning)
- [GitHub Actions：使用 OIDC 进行安全加固](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Docker：Build secrets](https://docs.docker.com/build/building/secrets/)
- 练习：对自己的一个项目运行 `gitleaks git .`，检查完整历史中是否有密钥，并为项目配置 pre-commit 扫描
