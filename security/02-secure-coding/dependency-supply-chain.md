# 依赖与软件供应链安全

> 方向：安全编码 · 相关标准：OWASP A03:2025（软件供应链失败）、A08:2025（软件或数据完整性失败）、CWE-1104（使用未维护的第三方组件）、SLSA · 最后更新：2026-10-22

## 1. 核心要点

- 你的应用里绝大部分代码来自依赖，**依赖的安全就是你的安全**。2025 版 Top 10 新增“软件供应链失败”并排在第 3 位。
- **锁定版本**：提交锁文件（`package-lock.json`、`poetry.lock`、`uv.lock`、`go.sum`），CI 中用 `npm ci` 这类严格按锁文件安装的命令。
- **持续扫描**已知漏洞（SCA），并用 Dependabot / Renovate 自动发起升级。
- **审查新依赖**：维护是否活跃、下载量、维护者、权限需求；警惕名字相似的仿冒包（typosquatting）和依赖混淆。
- **CI/CD 也是供应链的一部分**：第三方 Action 固定到提交 SHA，令牌权限最小化，谨慎处理来自 Fork 的 Pull Request。

## 2. 为什么重要

- **成因**：依赖树很深，开发者不清楚自己到底引入了什么；版本范围过宽导致自动拉取到被篡改的新版本；CI 有发布权限但防护薄弱。
- **影响**：已知漏洞被利用；恶意包在安装时（`postinstall` 脚本）窃取环境变量和密钥；构建系统被入侵后，发布的产物本身就带有后门，影响所有下游用户。
- **常见形态**：
  - **已知漏洞**：使用了有 CVE 的旧版本
  - **仿冒包**：`reqeusts` 冒充 `requests`
  - **依赖混淆**：公共仓库上出现了与公司内部包同名、版本号更高的包
  - **维护者账号被盗或恶意维护者**：合法包的新版本被植入恶意代码
  - **CI 被利用**：不受信任的输入在有权限的工作流中执行
- **标准**：[OWASP A03:2025](https://top10.owasp.org/2025)、[SLSA](https://slsa.dev/)

## 3. 常见错误 vs 正确做法

**锁定版本并严格安装**

```bash
# 错误：npm install 可能更新锁文件、拉取到范围内的新版本
npm install

# 正确：CI 中按锁文件精确安装，锁文件与 package.json 不一致时直接失败
npm ci

# Python（uv）：按锁文件安装，锁文件过期时失败
uv sync --locked

# pip：使用带哈希的 requirements 文件，任何包的内容变化都会导致安装失败
pip install --require-hashes -r requirements.txt
```

**减少安装脚本的风险**

```bash
# 对于不需要构建原生模块的项目，可以禁止安装脚本执行
npm ci --ignore-scripts
```

**防依赖混淆：内部包使用作用域并固定仓库地址**

```ini
# .npmrc：@mycompany 作用域下的包只从内部仓库获取
@mycompany:registry=https://npm.internal.example.com/
```

**GitHub Actions 加固**

```yaml
# 默认只给只读权限，需要的作业再单独提升
permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # 错误：@v4 这样的标签可以被移动，指向新的（可能被篡改的）代码
      # - uses: some-org/some-action@v4

      # 正确：固定到完整的提交 SHA，注释里写上版本便于升级
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          persist-credentials: false
```

```yaml
# 错误：直接把 PR 标题插入 shell 脚本，标题里的 $(...) 会被执行
# - run: echo "${{ github.event.pull_request.title }}"

# 正确：先放进环境变量，再在脚本里引用
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "$PR_TITLE"
```

另外：`pull_request_target` 触发的工作流拥有仓库的写权限和密钥，**不要在其中检出并运行 PR 里的代码**。

**生成 SBOM**

```bash
# 用 Syft 为项目或镜像生成 CycloneDX 格式的 SBOM
syft dir:. -o cyclonedx-json > sbom.json
syft myapp:1.2.3 -o cyclonedx-json > sbom-image.json
```

## 4. 如何识别

- 检查锁文件是否提交，CI 是否使用严格安装命令。
- 运行依赖漏洞扫描：`npm audit`、`pip-audit`、`govulncheck ./...`、`osv-scanner scan source -r .`、`trivy fs .`。
- 检查依赖的版本范围是否过宽（`*`、`latest`、`>=`）。
- 审查最近新增的依赖：名字是否拼写可疑，维护者和仓库是否可信，是否有可疑的安装脚本。
- 检查 CI 配置：
  - 第三方 Action 是否固定到 SHA
  - `permissions` 是否最小化
  - `${{ github.event.* }}` 是否被直接插入 `run` 脚本
  - 是否在 `pull_request_target` 中运行了不受信任的代码
- 可以使用 [OpenSSF Scorecard](https://github.com/ossf/scorecard) 评估依赖项目和自己项目的安全实践。

## 5. 防御清单

- [ ] 提交锁文件，CI 中使用 `npm ci` / `uv sync --locked` / `--require-hashes` 等严格安装方式
- [ ] 启用 Dependabot 或 Renovate，自动发起依赖升级 PR
- [ ] CI 中运行 SCA 扫描，高危漏洞阻止合并
- [ ] 新增依赖需要审查：维护状态、流行程度、许可证、安装脚本
- [ ] 内部包使用作用域/命名空间，并固定从内部仓库获取
- [ ] 定期清理不再使用的依赖
- [ ] 第三方 CI Action 固定到提交 SHA
- [ ] CI 令牌默认只读，按作业授予最小权限
- [ ] 不把不受信任的输入（PR 标题、分支名、Issue 内容）直接插入脚本
- [ ] 发布流程生成 SBOM，并对构建产物签名（如 Sigstore/cosign）、提供构建来源证明（provenance）
- [ ] 发布账号（npm、PyPI 等）开启 MFA，优先使用可信发布（Trusted Publishing）代替长期令牌

## 6. 自测题

**Q1.** 什么是依赖混淆（Dependency Confusion）？如何防御？

<details><summary>答案</summary>

公司内部有一个私有包 `internal-utils`，攻击者在公共仓库发布同名但版本号更高的包。如果包管理器同时查询内部仓库和公共仓库，并选择版本号最高的那个，就会安装攻击者的包。防御：内部包使用作用域（如 `@mycompany/`）；配置包管理器让特定作用域只从内部仓库获取；在公共仓库上预先注册同名包占位。

</details>

**Q2.** 为什么建议把 GitHub Action 固定到提交 SHA，而不是版本标签？

<details><summary>答案</summary>

标签是可以移动的。如果 Action 的仓库被攻击，攻击者可以把 `v4` 标签指向包含恶意代码的提交，所有引用 `@v4` 的工作流下次运行时就会执行恶意代码。提交 SHA 不可变，可以保证运行的始终是审查过的代码。

</details>

**Q3.** `npm install` 和 `npm ci` 的区别是什么？为什么 CI 中应该用 `npm ci`？

<details><summary>答案</summary>

`npm install` 会在版本范围内解析依赖，可能更新锁文件、安装到和开发者本地不一样的版本。`npm ci` 严格按照锁文件安装，锁文件与 `package.json` 不一致时直接报错，并且会先删除 `node_modules`。CI 中使用 `npm ci` 保证构建可重复，不会意外引入未审查的新版本。

</details>

**Q4.** SBOM 有什么用？

<details><summary>答案</summary>

SBOM（软件物料清单）列出了软件包含的所有组件及其版本。当一个新的高危漏洞公开时，可以快速查出哪些产品、哪些版本受影响，而不需要逐个项目排查。它也是很多合规要求和客户审核的内容。

</details>

**Q5.** 一个依赖库被发现有高危漏洞，但你的代码没有调用到存在漏洞的函数，还需要升级吗？

<details><summary>答案</summary>

一般仍然建议升级，或者至少记录风险评估结论。原因：判断“是否调用到”可能有误（间接调用、未来的代码改动）；扫描工具会持续报警，影响对其他问题的关注；有些工具（如 `govulncheck`）可以做可达性分析，帮助确定优先级，但不能作为永远不升级的理由。确实无法升级时，要记录原因并设定复查时间。

</details>

## 7. 延伸阅读与练习

- [OWASP Software Supply Chain Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Software_Supply_Chain_Security_Cheat_Sheet.html)
- [OWASP CI/CD Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html)
- [GitHub：Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
- [SLSA](https://slsa.dev/)、[Sigstore](https://www.sigstore.dev/)、[OpenSSF Scorecard](https://github.com/ossf/scorecard)
- 练习：对自己的项目运行 `osv-scanner scan source -r .`，处理发现的问题；检查项目中所有 GitHub Actions 工作流，按上面的清单加固
