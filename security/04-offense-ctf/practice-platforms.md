# 正规练习平台与学习路线

> 只收录专门为学习而设计、明确允许练习的平台。使用前请阅读每个平台的规则，例如有的平台禁止攻击其他用户或平台本身的基础设施。最后更新：2026-10-22

## 按方向推荐

| 方向 | 平台 | 费用 | 说明 |
| --- | --- | --- | --- |
| Web 安全 | [PortSwigger Web Security Academy](https://portswigger.net/web-security) | 免费 | 按主题组织的讲解 + 在线实验，从 Apprentice 到 Expert 分级，**Web 方向首选** |
| Web 安全 | [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/) | 免费、开源 | 用 Docker 在本地运行的完整漏洞应用，有积分板和提示 |
| Web 安全 | [OWASP WebGoat](https://owasp.org/www-project-webgoat/) | 免费、开源 | 每一课都有讲解，适合配合 Java 源码理解漏洞成因 |
| 安全编码 | [OWASP Juice Shop 源码](https://github.com/juice-shop/juice-shop) | 免费 | 先在应用中发现问题，再到源码里定位原因并写修复 |
| 密码学 | [CryptoPals](https://cryptopals.com/) | 免费 | 通过亲手实现来理解密码学的常见误用 |
| Linux 基础 | [OverTheWire](https://overthewire.org/wargames/) | 免费 | 从 Bandit 开始，在 SSH 环境里逐关熟悉 Linux 命令和权限 |
| 云安全 | [flAWS](http://flaws.cloud/)、[flAWS2](http://flaws2.cloud/) | 免费 | 专为学习 AWS 常见错配而设计 |
| 综合入门 | [picoCTF](https://picoctf.org/) | 免费 | 卡内基梅隆大学主办，题库长期开放，非常适合入门 |
| 综合入门 | [TryHackMe](https://tryhackme.com/) | 部分免费 | 引导式的学习路径，讲解较多 |
| 综合进阶 | [Hack The Box](https://www.hackthebox.com/) | 部分免费 | 靶机和挑战题，难度跨度大；Academy 有系统化的课程 |
| 比赛 | [CTFtime](https://ctftime.org/) | 免费 | 全球 CTF 比赛日历和往届题解 |

## 建议路线

**阶段一：打基础（4–6 周）**

- OverTheWire Bandit 前 20 关，熟悉 Linux
- picoCTF 题库中各分类的入门题
- 同步阅读本库 [01 Web/应用安全](../01-web-security/README.md)

**阶段二：Web 专项（6–8 周）**

- PortSwigger Academy：按 01 方向笔记的顺序，完成每个主题的 Apprentice 级实验
- 本地跑起 Juice Shop，完成一星和二星挑战
- 每完成一个主题，回头对照笔记中的“防御清单”，想清楚这个实验对应的代码该怎么修

**阶段三：拓展方向（持续）**

- 密码学：CryptoPals 第 1–2 组
- 云安全：flAWS 全部关卡
- 综合：TryHackMe 或 Hack The Box 的入门学习路径
- 参加一场面向新手的 CTF 比赛，赛后阅读其他队伍的题解

## 练习习惯

- **写题解（Writeup）**：每完成一题，记下考点、思路、卡住的地方，以及**对应的防御方法**。比赛期间不要公开题解，遵守平台关于公开题解的规则。
- **先自己想，再看提示**：卡住超过一段时间再看提示，看完之后要弄明白为什么自己没想到。
- **回到防御**：每个练习都问一句“如果这是我的系统，我该怎么修、怎么发现”，把收获补进本库对应的笔记。
- **只在平台上练**：练习平台以外的系统，没有书面授权一律不要尝试（见 [道德与授权范围](ethics-and-scope.md)）。
