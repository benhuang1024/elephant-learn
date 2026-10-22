# Linux 主机加固

> 方向：基础设施 · 相关标准：CIS Benchmarks（各发行版）、CWE-250（以不必要的权限执行）、CWE-732（关键资源权限设置不当） · 最后更新：2026-10-22

## 1. 核心要点

- **SSH**：只允许密钥登录，禁止 root 直接登录，限制允许登录的用户，有条件的放在堡垒机或 VPN 后面。
- **补丁**：及时安装安全更新，开启自动安全更新，定期重启以加载新内核。
- **账号与权限**：每个服务使用专用的低权限账号，`sudo` 按需授权，不共享账号，定期清理离职人员和无用账号。
- **最小化**：卸载不需要的软件包，关闭不需要的服务和端口。
- **审计**：开启 `auditd` 或等价机制，日志集中发送到远端，防止被入侵后篡改。

## 2. 为什么重要

- **成因**：默认安装开启了不需要的服务；SSH 暴露在公网并允许密码登录；服务以 root 身份运行；补丁长期不打。
- **影响**：暴露在公网的 SSH 会持续受到自动化的密码爆破；应用漏洞在 root 身份下直接变成整台主机失陷；已知的内核或系统组件漏洞被用于提升权限。
- **标准**：[CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks)

## 3. 常见错误 vs 正确做法

**SSH 配置（`/etc/ssh/sshd_config.d/hardening.conf`）**

```text
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowGroups ssh-users
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
# 修改后先检查语法，并保持当前会话不断开，用新窗口测试能否登录，避免把自己锁在外面
sudo sshd -t && sudo systemctl reload ssh
```

客户端密钥推荐使用 Ed25519：`ssh-keygen -t ed25519`，私钥设置口令。

**自动安全更新（Debian/Ubuntu）**

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

RHEL 系可以使用 `dnf-automatic`，并配置为只自动安装安全更新。

**服务使用专用账号，并用 systemd 加以限制**

```ini
# /etc/systemd/system/myapp.service
[Service]
User=myapp
Group=myapp
ExecStart=/opt/myapp/bin/myapp

# 以下选项大幅限制进程即使被入侵后能做的事情
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ReadWritePaths=/var/lib/myapp
CapabilityBoundingSet=
RestrictSUIDSGID=yes
```

```bash
# 查看服务的安全评分，并根据建议继续收紧
systemd-analyze security myapp.service
```

**sudo 按需授权**

```text
# 错误：给运维账号完全的 sudo 权限，且不需要密码
# deploy ALL=(ALL) NOPASSWD: ALL

# 正确：只允许执行需要的命令（/etc/sudoers.d/deploy，用 visudo -f 编辑）
deploy ALL=(root) /usr/bin/systemctl restart myapp
```

注意：允许通过 sudo 运行编辑器、`find`、`tar`、解释器等程序，几乎等同于给了完整的 root 权限，因为这些程序都能启动 Shell。

**文件权限**

```bash
# 敏感配置只允许服务账号读取
sudo chown root:myapp /etc/myapp/config.yaml
sudo chmod 640 /etc/myapp/config.yaml

# 定期检查全局可写的文件，以及非预期的 SUID/SGID 程序
sudo find / -xdev -type f -perm -0002 -ls 2>/dev/null
sudo find / -xdev -type f \( -perm -4000 -o -perm -2000 \) -ls 2>/dev/null
```

## 4. 如何识别

- `ss -tlnp`：哪些端口在监听？是否有不认识的服务？是否监听在 `0.0.0.0` 而实际只需要本地访问？
- `sshd -T | grep -Ei 'permitrootlogin|passwordauthentication'`：查看 SSH 实际生效的配置。
- `ps -eo user,pid,cmd | grep -v '^root'` 和 `ps -U root`：哪些服务以 root 运行，是否必要？
- 检查 `/etc/sudoers` 和 `/etc/sudoers.d/` 中的规则，特别是 `NOPASSWD` 和 `ALL`。
- 检查 `/etc/passwd` 中有登录 Shell 的账号，以及 `~/.ssh/authorized_keys` 中的公钥是否都认识。
- 检查待安装的安全更新：`apt list --upgradable`、`dnf updateinfo list security`。
- 运行 [Lynis](https://cisofy.com/lynis/)：`sudo lynis audit system`，按报告逐项处理。

## 5. 防御清单

- [ ] SSH 禁止 root 登录和密码登录，只允许指定用户组
- [ ] SSH 不直接暴露在公网，或者至少限制来源 IP
- [ ] 开启自动安全更新，并有计划地重启以加载新内核
- [ ] 卸载不需要的软件包，关闭不需要的服务
- [ ] 每个服务使用专用的低权限账号，并用 systemd 安全选项加以限制
- [ ] sudo 只授予必要的命令，避免 `NOPASSWD: ALL`
- [ ] 敏感文件权限最小化，定期检查全局可写文件和 SUID 程序
- [ ] 主机防火墙默认拒绝入站（见 [网络安全](network-security.md)）
- [ ] 开启 auditd，日志集中发送到远端（见 [日志与监控](logging-monitoring.md)）
- [ ] 时间同步（chrony/systemd-timesyncd），保证日志时间准确
- [ ] 定期清理无用账号和过期的 SSH 公钥

## 6. 自测题

**Q1.** 为什么建议 SSH 禁止密码登录，只允许密钥登录？

<details><summary>答案</summary>

暴露在网络上的 SSH 会持续受到自动化的密码爆破和撞库。密钥认证使用非对称加密，私钥不会在网络上传输，也无法被暴力猜出。即使服务器被冒充，攻击者也拿不到私钥。

</details>

**Q2.** 为什么不应该让 Web 服务以 root 身份运行？

<details><summary>答案</summary>

如果服务存在漏洞（如命令注入），攻击者获得的权限就是服务进程的权限。以 root 运行意味着一个应用漏洞直接变成整台主机被控制。使用专用低权限账号，再配合 systemd 的沙箱选项，可以把影响限制在很小的范围内。需要绑定 1024 以下端口时，可以使用反向代理或授予 `CAP_NET_BIND_SERVICE` 能力。

</details>

**Q3.** 为什么 `deploy ALL=(root) NOPASSWD: /usr/bin/vim` 这样的 sudo 规则很危险？

<details><summary>答案</summary>

vim 可以通过 `:!sh` 等方式启动 Shell，而这个 Shell 会继承 root 权限。很多常见程序（编辑器、`less`、`find`、`tar`、`awk`、各种解释器）都有类似的“逃逸”方式。sudo 规则应该只允许执行功能单一、参数受限的命令，或者使用专门的包装脚本。

</details>

**Q4.** `systemd` 的 `NoNewPrivileges=yes` 有什么作用？

<details><summary>答案</summary>

它保证进程及其子进程无法通过 `execve` 获得新的权限，比如执行 SUID 程序时不会提升为文件所有者的权限，也不会获得文件能力（file capabilities）。这能有效阻止很多利用 SUID 程序提权的路径。

</details>

**Q5.** 为什么日志要发送到远端，而不只是保存在本机？

<details><summary>答案</summary>

攻击者获得 root 权限后，通常会清除或篡改本机日志来掩盖痕迹。日志实时发送到远端的集中日志系统，本机被入侵后也无法修改已经发出去的记录。集中存储还便于跨主机关联分析和设置告警。

</details>

## 7. 延伸阅读与练习

- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks)（选择对应的发行版）
- [Mozilla OpenSSH 安全指南](https://infosec.mozilla.org/guidelines/openssh)
- [systemd.exec 文档：沙箱相关选项](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [Lynis](https://cisofy.com/lynis/)
- [OverTheWire Bandit](https://overthewire.org/wargames/bandit/)：在合法环境中熟悉 Linux 权限和常用命令
- 练习：在一台全新安装的测试虚拟机上运行 Lynis 记录分数，按本篇清单加固后再次运行，对比结果
