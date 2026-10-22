# 02 安全编码/代码审计

Web 安全方向讲的是“漏洞长什么样”，本方向讲的是“写代码时怎么不写出漏洞，审代码时怎么把漏洞找出来”。重点是把安全要求变成日常开发习惯和自动化检查。

## 前置知识

- 读完 [01 Web/应用安全](../01-web-security/README.md)，至少熟悉访问控制、注入、XSS
- 熟悉至少一种后端语言和它的包管理工具（pip、npm、go mod、Maven 等）
- 用过 Git 和一种 CI 系统（GitHub Actions、GitLab CI 等）

## 要点速览与建议顺序

| 顺序 | 笔记 | 一句话要点 |
| --- | --- | --- |
| 1 | [代码审计清单](code-review-checklist.md) | 先画信任边界，再从“输入从哪来、到哪去”跟踪数据流 |
| 2 | [输入输出处理](input-output-handling.md) | 入口处按白名单校验，出口处按上下文编码，不反序列化不可信数据 |
| 3 | [密码学使用](crypto-usage.md) | 用成熟的高层库和 AEAD，随机数用 CSPRNG，不自己设计加密方案 |
| 4 | [密钥管理](secrets-management.md) | 密钥不进代码和仓库，集中管理、定期轮换，泄露后先吊销 |
| 5 | [依赖与供应链](dependency-supply-chain.md) | 锁定版本、扫描漏洞、审查新依赖，把 CI 当作生产系统来保护 |
| 6 | [安全工具](security-tooling.md) | SAST + SCA + 秘密扫描接入 CI，先求低误报，再求高覆盖 |

## 本方向练习

- 在自己的一个项目上走一遍 [代码审计清单](code-review-checklist.md)，记录发现的问题
- 给自己的项目接入 Semgrep、依赖扫描和 Gitleaks，见 [安全工具](security-tooling.md)
- [OWASP WebGoat](https://owasp.org/www-project-webgoat/)：带讲解的 Java 漏洞练习应用，适合配合源码学习
- [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/)：源码公开，可以练习“先黑盒发现问题，再去源码里定位原因”
