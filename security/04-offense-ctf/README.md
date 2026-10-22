# 04 攻防实战/CTF

理解攻击者的思路，是做好防御的前提。本方向关注三件事：**在合法合规的前提下**做测试，用**系统化的方法论**代替碰运气，以及通过 **CTF 和正规靶场**持续练习。

> 再次强调：只在自己拥有的系统、正规练习平台，或获得**书面授权**的范围内进行测试。见 [道德与授权范围](ethics-and-scope.md)。

## 前置知识

- 读完 [01 Web/应用安全](../01-web-security/README.md)
- 熟悉 Linux 命令行和至少一种脚本语言（推荐 Python）
- 了解 HTTP、TCP/IP 基础
- 会用浏览器开发者工具，了解至少一种 HTTP 代理工具（如 Burp Suite Community 或 ZAP）

## 要点速览与建议顺序

| 顺序 | 笔记 | 一句话要点 |
| --- | --- | --- |
| 1 | [道德与授权范围](ethics-and-scope.md) | 没有书面授权就不测试；严格遵守范围；发现漏洞负责任地披露 |
| 2 | [渗透测试方法论](pentest-methodology.md) | 按“准备 → 信息收集 → 分析 → 验证 → 报告”的流程推进，每一步都留记录 |
| 3 | [练习平台](practice-platforms.md) | 选择合适的正规平台，按路线循序渐进 |

## 本方向练习

- 先完成 [PortSwigger Web Security Academy](https://portswigger.net/web-security) 中与 01 方向对应的 Apprentice 级实验
- 参加一次 [picoCTF](https://picoctf.org/) 或在 [CTFtime](https://ctftime.org/) 上找一场面向新手的比赛
- 每做完一道题，按 [渗透测试方法论](pentest-methodology.md) 中的报告格式写一份简短的题解（Writeup），重点写**为什么**而不只是**怎么做**
