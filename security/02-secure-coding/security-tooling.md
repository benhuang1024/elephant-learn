# 安全工具：SAST、SCA、秘密扫描、DAST

> 方向：安全编码 · 相关标准：OWASP DevSecOps Guideline、OWASP ASVS V1（架构与设计） · 最后更新：2026-10-22

## 1. 核心要点

- 不同工具解决不同问题：**SAST** 扫源代码，**SCA** 扫依赖，**秘密扫描**找泄露的凭证，**IaC/镜像扫描**查配置和基础镜像，**DAST** 测运行中的应用。
- 接入顺序建议：**秘密扫描 → SCA → SAST → IaC/镜像扫描 → DAST**。前两者误报少、见效快。
- **先求低误报，再求高覆盖**。误报太多，团队很快就会忽略所有告警。从高置信度的规则开始，逐步扩大范围。
- 工具要**左移**（在本地和 PR 中就运行），并且**阻断**真正高危的问题，而不只是生成一份没人看的报告。
- 工具不能代替人工审计，它们找不到越权和业务逻辑缺陷（见 [代码审计清单](code-review-checklist.md)）。

## 2. 为什么重要

- **成因**：人工审计成本高、覆盖不全，很多常见错误（硬编码密钥、已知漏洞的依赖、明显的注入模式）完全可以自动发现。
- **价值**：在代码合并前低成本地拦住大量问题，把人力留给工具做不到的事情。
- **局限**：每种工具都有误报和漏报。SAST 不理解业务语义，SCA 只知道已公开的漏洞，DAST 只能覆盖它爬到的页面。

## 3. 常见错误 vs 正确做法

| 常见错误 | 正确做法 |
| --- | --- |
| 一次性启用所有规则，产生上千条告警 | 从高置信度规则集开始，建立基线后逐步扩展 |
| 只在发布前扫描一次 | 本地 pre-commit + PR 检查 + 定期全量扫描 |
| 扫描结果只是报告，不影响合并 | 高危问题阻止合并，其余问题进入待办并跟踪 |
| 误报直接全局关闭规则 | 在具体位置标注忽略并写明原因，便于后续审查 |
| 只扫当前代码 | 秘密扫描要覆盖完整 Git 历史 |

**工具速查**

| 类型 | 工具（开源/免费为主） | 用途 |
| --- | --- | --- |
| SAST | [Semgrep](https://semgrep.dev/)、[CodeQL](https://codeql.github.com/)、Bandit（Python）、gosec（Go）、ESLint 安全插件 | 在源码中找危险模式和数据流问题 |
| SCA | `npm audit`、`pip-audit`、`govulncheck`、[OSV-Scanner](https://google.github.io/osv-scanner/)、Dependabot | 找依赖中的已知漏洞 |
| 秘密扫描 | [Gitleaks](https://github.com/gitleaks/gitleaks)、[TruffleHog](https://github.com/trufflesecurity/trufflehog)、GitHub Secret Scanning | 找代码和历史中的凭证 |
| IaC / 镜像 | [Trivy](https://trivy.dev/)、Checkov、KICS、Hadolint（Dockerfile） | 扫 Terraform、K8s YAML、Dockerfile、镜像漏洞 |
| DAST | [ZAP](https://www.zaproxy.org/)、Burp Suite | 对运行中的应用做测试（只能用于自己的或已授权的环境） |
| SBOM | [Syft](https://github.com/anchore/syft) | 生成软件物料清单 |

**本地运行示例**

```bash
# Semgrep：使用社区维护的默认规则集扫描当前目录
semgrep scan --config auto

# Bandit：扫描 Python 代码，只显示中高严重性的问题
bandit -r src/ -ll

# Gitleaks：扫描完整 Git 历史
gitleaks git .

# OSV-Scanner：扫描项目中所有锁文件
osv-scanner scan source -r .

# Trivy：扫描文件系统中的依赖漏洞、配置问题和密钥
trivy fs --scanners vuln,misconfig,secret .
```

工具可以用 `pipx install semgrep`、`brew install gitleaks trivy osv-scanner` 安装，也可以直接用官方 Docker 镜像运行，不在本机安装。

**pre-commit 配置**

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.24.2
    hooks:
      - id: gitleaks
```

版本号以写入时各项目发布的最新版为准。

**GitHub Actions 中接入 Semgrep**

```yaml
name: security
on:
  pull_request:
permissions:
  contents: read
jobs:
  semgrep:
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: semgrep scan --config auto --error
```

**编写自定义 Semgrep 规则**

当项目有特定的危险模式时，自定义规则很有价值：

```yaml
rules:
  - id: flask-query-without-owner
    languages: [python]
    severity: WARNING
    message: >-
      按 ID 查询订单时没有限制 owner_id，可能存在越权访问。
      请使用 filter_by(id=..., owner_id=current_user.id)。
    pattern: Order.query.get_or_404($ID)
```

**误报处理：就地标注并写明原因**

```python
# 这里的 SQL 只拼接了白名单里的列名，参数仍然是绑定的
cur.execute(f"SELECT * FROM t ORDER BY {column}", ())  # nosemgrep: python.lang.security.audit.formatted-sql-query
```

## 4. 如何识别（评估自己项目的工具覆盖情况）

- 仓库里是否有 `.pre-commit-config.yaml`？是否包含秘密扫描？
- CI 中是否运行 SAST 和 SCA？结果是否会阻止合并？
- 是否开启了代码托管平台自带的安全功能（Dependabot、Secret Scanning、Code Scanning）？
- 现有的告警有多少？其中多少是长期没人处理的？误报率大概是多少？
- 镜像和 IaC 文件是否在构建流程中被扫描？

## 5. 防御清单

- [ ] 本地 pre-commit 运行秘密扫描
- [ ] 开启代码托管平台的秘密扫描和推送保护
- [ ] CI 中运行 SCA，高危漏洞阻止合并
- [ ] CI 中运行 SAST，从高置信度规则开始
- [ ] Dockerfile、K8s YAML、Terraform 在 CI 中做配置扫描
- [ ] 镜像在推送前做漏洞扫描
- [ ] 误报在代码中就地标注原因，不全局关闭规则
- [ ] 为项目特有的危险模式编写自定义规则
- [ ] 定期回顾告警处理情况，清理长期未处理的告警
- [ ] DAST 只在自己的测试环境中运行

## 6. 自测题

**Q1.** SAST、SCA、DAST 分别检查什么？各有什么局限？

<details><summary>答案</summary>

SAST 分析源代码，能定位到具体代码行，但不理解业务语义，误报较多，也找不到运行时配置问题。SCA 检查依赖及其已知漏洞，误报少，但只能发现已公开的漏洞。DAST 从外部测试运行中的应用，能发现配置和运行时问题，但只能覆盖扫描到的页面，并且难以定位到代码。

</details>

**Q2.** 为什么建议先接入秘密扫描和 SCA，再接入 SAST？

<details><summary>答案</summary>

秘密扫描和 SCA 的误报率低，结果明确（这里有一个密钥 / 这个版本有 CVE），修复方式也清楚（吊销密钥 / 升级版本），很容易让团队看到价值。SAST 误报较多，需要调规则、建基线，如果一开始就产生大量告警，团队可能会对安全工具产生抵触。

</details>

**Q3.** 秘密扫描为什么要扫完整的 Git 历史？

<details><summary>答案</summary>

密钥即使在后来的提交中删除了，仍然保存在历史提交中，任何能克隆仓库的人都能找回来。只扫当前代码会漏掉这些已经“删除”但实际仍然可访问的密钥。

</details>

**Q4.** 遇到 SAST 误报时，为什么不建议直接全局关闭这条规则？

<details><summary>答案</summary>

这条规则在别的地方可能发现的是真问题，全局关闭会让以后出现的同类真问题也被漏掉。应该在具体位置标注忽略并写明原因，这样既消除了这个误报，又保留了审查记录，规则继续保护其他代码。如果某条规则误报率确实太高，可以调整规则本身而不是彻底关闭。

</details>

**Q5.** 为什么扫描工具发现不了越权漏洞？应该怎么补？

<details><summary>答案</summary>

越权漏洞的代码在模式上通常完全正常，问题在于少了一个业务相关的检查条件，工具不知道“谁应该能访问什么”。弥补方式：人工审计时重点检查；为项目的权限模式编写自定义规则（如上面的 Semgrep 规则）；为越权场景编写自动化测试。

</details>

## 7. 延伸阅读与练习

- [OWASP DevSecOps Guideline](https://owasp.org/www-project-devsecops-guideline/)
- [Semgrep 规则编写文档](https://semgrep.dev/docs/writing-rules/overview)
- [CodeQL 文档](https://codeql.github.com/docs/)
- [OWASP Benchmark](https://owasp.org/www-project-benchmark/)：评估 SAST 工具准确度的测试集
- 练习：给自己的一个项目依次接入 Gitleaks（pre-commit）、OSV-Scanner、Semgrep，记录每个工具发现的问题和误报数量，并为项目写一条自定义 Semgrep 规则
