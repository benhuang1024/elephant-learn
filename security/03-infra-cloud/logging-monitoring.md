# 日志、监控与应急响应

> 方向：基础设施 · 相关标准：OWASP A09:2025（安全日志与告警失败）、CWE-778（日志记录不足）、CWE-532（日志中包含敏感信息）、NIST SP 800-61（事件处理指南）、MITRE ATT&CK · 最后更新：2026-10-22

## 1. 核心要点

- **记录安全相关事件**：登录成功/失败、权限变更、访问控制失败、输入校验失败、高价值操作（支付、导出、删除）、管理操作。
- **日志要能回答“谁、什么时候、从哪里、做了什么、结果如何”**，用结构化格式（JSON），带上请求 ID 便于串联。
- **日志里不能有敏感数据**：密码、令牌、完整的银行卡号、身份证号、会话 ID。
- **集中、防篡改、有保留期**：日志实时发送到集中平台，与业务系统权限隔离，按合规要求保留。
- **只记录不告警等于没有记录**。2025 版 Top 10 特意把这一项更名为“日志与**告警**失败”。要为关键场景设置告警，并提前准备好应急响应流程。

## 2. 为什么重要

- **成因**：只记录调试和错误日志，不记录安全事件；日志分散在各台机器上；有日志但没人看；告警太多导致“告警疲劳”。
- **影响**：攻击发生后很长时间才被发现，甚至是被外部通知才知道；事后无法确定影响范围（哪些数据被访问了），只能按最坏情况处理。
- **标准**：[OWASP A09:2025](https://top10.owasp.org/2025)、[NIST SP 800-61](https://csrc.nist.gov/pubs/sp/800/61/r3/final)

## 3. 常见错误 vs 正确做法

**安全事件日志：结构化、带上下文、不含敏感数据**

```python
import json
import logging
from datetime import datetime, timezone

security_logger = logging.getLogger("security")


def log_security_event(event: str, outcome: str, **fields):
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,          # 例如 auth.login、authz.denied、user.role_changed
        "outcome": outcome,      # success / failure
        "request_id": fields.pop("request_id", None),
        "user_id": fields.pop("user_id", None),
        "src_ip": fields.pop("src_ip", None),
        **fields,
    }
    security_logger.info(json.dumps(record, ensure_ascii=False))


# 记录登录失败：带上用户名和来源 IP，但不记录密码
log_security_event(
    "auth.login", "failure",
    username="alice", src_ip="203.0.113.10", reason="bad_password", request_id="req-123",
)
```

**错误：记录了敏感信息**

```python
# 错误：密码和令牌进入了日志，日志系统的权限通常比数据库宽松得多
logger.info(f"login attempt user={username} password={password}")
logger.debug(f"headers={dict(request.headers)}")  # 包含 Authorization 和 Cookie
```

**值得设置告警的场景**

| 场景 | 示例规则 |
| --- | --- |
| 暴力破解/撞库 | 同一 IP 5 分钟内登录失败超过 20 次；同一账号失败后紧接着成功 |
| 越权尝试 | 同一用户短时间内大量 403 |
| 高危管理操作 | 新增管理员、修改权限、关闭审计日志、创建云访问密钥 |
| 根账号/超级管理员使用 | 任何一次根账号登录 |
| 异常数据访问 | 单个用户导出量远超平时 |
| 主机异常 | 新增 SUID 文件、新的 SSH 公钥、以 Web 服务用户身份启动 Shell |
| 费用/资源异常 | 突然大量创建计算实例 |

告警规则要有明确的负责人和处理步骤（runbook），并定期清理误报，避免告警疲劳。

**主机审计（auditd 规则示例）**

```text
# /etc/audit/rules.d/hardening.rules
# 监控身份相关文件的修改
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k privilege
-w /etc/sudoers.d/ -p wa -k privilege
# 监控 SSH 配置的修改
-w /etc/ssh/sshd_config -p wa -k sshd
```

## 4. 如何识别（评估现有日志能力）

做一次“桌面推演”，问自己这些问题：

- 如果某个用户的账号昨天被盗用了，我能查出攻击者用这个账号做了哪些操作吗？
- 我能知道某个管理员权限是谁、在什么时候授予的吗？
- 如果有人从一个陌生 IP 登录了生产服务器，我会在多长时间内知道？
- 日志保存在哪里？如果服务器被攻陷，攻击者能删除它们吗？
- 日志会保留多久？够不够事后调查？
- 搜索现有日志，里面有没有密码、令牌、身份证号这类敏感数据？

## 5. 防御清单

- [ ] 记录认证、授权失败、权限变更、高价值操作、管理操作等安全事件
- [ ] 日志使用结构化格式，包含时间（UTC）、用户、来源 IP、操作、结果、请求 ID
- [ ] 日志中不包含密码、令牌、会话 ID、完整的敏感个人信息
- [ ] 对日志输入中的换行等控制字符做处理，防止日志注入
- [ ] 日志实时发送到集中平台，业务系统无权删除或修改
- [ ] 按合规和调查需要设置保留期
- [ ] 所有系统时间同步
- [ ] 为关键场景设置告警，每条告警有负责人和处理手册
- [ ] 定期回顾告警质量，清理误报
- [ ] 制定应急响应流程，并定期演练

**应急响应的基本流程（NIST SP 800-61 r2 的经典生命周期；2025 年发布的 r3 改为按 CSF 2.0 的职能组织，核心环节一致）**

1. **准备**：明确联系人和职责，准备好工具、权限、处理手册，提前确认日志可用
2. **检测与分析**：确认是否真的是安全事件，判断影响范围和严重程度，记录时间线
3. **遏制**：隔离受影响的系统，吊销泄露的凭证，阻断攻击来源，注意先保全证据
4. **根除**：找到并消除根本原因（漏洞、后门、被篡改的配置）
5. **恢复**：从可信的备份或镜像恢复，加强监控，确认没有复发
6. **复盘**：不追责、只改进，形成具体的改进事项并跟踪落实

## 6. 自测题

**Q1.** 为什么说“只有日志、没有告警”不够？

<details><summary>答案</summary>

日志只有在被查看时才有价值。没有告警，攻击可能持续数月都没人发现，直到外部通知或造成明显损失。告警把需要人立即关注的事件主动推送出来，大大缩短从攻击发生到被发现的时间。

</details>

**Q2.** 一条好的安全日志应该包含哪些字段？

<details><summary>答案</summary>

至少包括：时间戳（带时区，建议 UTC）、事件类型、结果（成功/失败）、操作主体（用户 ID/服务身份）、来源（IP、User-Agent）、操作对象（资源 ID）、请求 ID 或追踪 ID。目标是能回答“谁、什么时候、从哪里、对什么、做了什么、结果如何”。

</details>

**Q3.** 什么是告警疲劳？如何避免？

<details><summary>答案</summary>

告警太多、误报太多，处理人员逐渐习惯于忽略告警，真正重要的告警也会被淹没。避免方法：从少量高置信度的规则开始；每条告警必须可处理、有负责人和处理手册；定期复盘告警，调整阈值或删除没有价值的规则；按严重程度分级，只有高优先级的告警才实时通知。

</details>

**Q4.** 应急响应中，为什么“遏制”时要注意保全证据？

<details><summary>答案</summary>

直接关机、重装或删除可疑文件，会丢失内存中的信息、进程状态和攻击者留下的痕迹，导致无法确定攻击的入口、范围和持续时间，也无法确认是否已经彻底清除。合适的做法是先隔离网络、做快照或内存镜像、收集日志，再进行清理。

</details>

**Q5.** 为什么复盘要强调“不追责”？

<details><summary>答案</summary>

如果复盘的目的是找人担责，参与者会倾向于隐瞒细节，团队就无法了解真实情况，也就无法找到系统性的改进方向。大多数事件的根源是流程、工具和设计上的缺陷，而不是某个人的失误。不追责的复盘能让信息充分暴露，从而真正防止同类问题再次发生。

</details>

## 7. 延伸阅读与练习

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Logging Vocabulary Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html)
- [NIST SP 800-61：Incident Response](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
- [MITRE ATT&CK](https://attack.mitre.org/)：了解攻击者常见的技术，据此设计检测规则
- [Sigma](https://github.com/SigmaHQ/sigma)：通用的检测规则格式和规则库
- 练习：为自己的一个应用补充安全事件日志，用上面的“桌面推演”问题逐个检查；选 3 个告警场景，在自己使用的日志平台上实现告警规则
