# 网络安全

> 方向：基础设施 · 相关标准：CIS Controls（网络基础设施管理）、NIST SP 800-207（零信任架构）、CWE-319（敏感信息明文传输） · 最后更新：2026-10-22

## 1. 核心要点

- **默认拒绝入站**：只开放明确需要的端口，并尽量限制来源。数据库、缓存、管理端口不对公网开放。
- **网络分段**：按信任级别和功能划分网络区域（公网入口、应用、数据、管理），区域之间只开放必要的流量。
- **出站也要控制**：服务器不需要随意访问互联网，限制出站可以降低数据外泄和失陷主机“回连”的风险。
- **所有传输加密**：对外统一 HTTPS（TLS 1.2+，推荐 1.3），内部服务之间也尽量使用 TLS 或 mTLS。
- **零信任**：不因为“在内网”就信任一个请求，每个服务都做认证和授权。

## 2. 为什么重要

- **成因**：为了调试临时开放的端口没有关；数据库绑定在 `0.0.0.0`；整个内网是一个扁平网络；内部流量用 HTTP 明文。
- **影响**：未鉴权的数据库、缓存、搜索引擎暴露在公网，导致数据被整库拖走或被勒索；一台主机被攻陷后，攻击者可以在扁平网络里横向移动；明文流量被窃听。
- **标准**：[NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final)

## 3. 常见错误 vs 正确做法

**服务只监听需要的地址**

```text
# 错误：Redis/数据库监听所有网卡，并且没有密码
bind 0.0.0.0

# 正确：只监听本机或内网地址，并开启认证（Redis 示例）
bind 127.0.0.1 10.0.2.15
protected-mode yes
# 使用 ACL 为应用创建只有必要权限的用户
```

**主机防火墙：默认拒绝入站（nftables 示例）**

```text
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;

    ct state established,related accept
    iif "lo" accept
    ip protocol icmp accept
    meta l4proto ipv6-icmp accept

    # 只允许来自堡垒机网段的 SSH
    ip saddr 10.0.0.0/24 tcp dport 22 accept
    # 对外提供 HTTPS
    tcp dport { 80, 443 } accept
  }
}
```

Ubuntu 上更简单的方式是 `ufw`：

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

**云上安全组：按来源限制**

| 端口 | 错误配置 | 正确配置 |
| --- | --- | --- |
| 22（SSH） | `0.0.0.0/0` | 只允许堡垒机/VPN 网段，或改用云厂商的会话管理服务（如 AWS SSM Session Manager） |
| 5432（PostgreSQL） | `0.0.0.0/0` | 只允许应用服务器所在的安全组 |
| 6379（Redis） | `0.0.0.0/0` | 只允许应用服务器所在的安全组 |
| 443（HTTPS） | — | 对外开放，前面放负载均衡/WAF |

**TLS 配置（Nginx，参考 Mozilla “Intermediate” 配置）**

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_tickets off;

# HTTP 统一跳转到 HTTPS
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

具体的加密套件建议直接用 [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/) 生成，证书使用 Let's Encrypt 等自动续期方案。

**内部服务之间使用 mTLS**

在 Kubernetes 中可以借助服务网格（如 Istio、Linkerd）自动为服务间流量启用 mTLS，并基于服务身份做访问控制，而不是基于 IP。

## 4. 如何识别

- 在主机上：`ss -tlnp` 查看监听的端口和地址，确认每一个都是必要的。
- 从外部检查**自己的**服务器暴露了哪些端口，例如在另一台自己的机器上运行 `nmap -Pn <你自己的服务器 IP>`（只扫描自己拥有或获得授权的地址）。
- 审查云上的安全组/防火墙规则，重点找 `0.0.0.0/0` 和 `::/0` 的入站规则。
- 检查 TLS 配置：用 [SSL Labs](https://www.ssllabs.com/ssltest/) 或 `testssl.sh` 测试自己的域名。
- 画出网络拓扑：哪些区域可以访问数据库？一台 Web 服务器被攻陷后能连到哪里？
- 检查出站规则：服务器能否访问任意外网地址？

## 5. 防御清单

- [ ] 主机和云安全组默认拒绝入站，只开放必要端口
- [ ] SSH、RDP、数据库、缓存、管理后台不对公网开放
- [ ] 服务只监听需要的网卡地址
- [ ] 按功能和信任级别划分网络区域，区域之间按需放行
- [ ] 限制出站流量，必要时通过代理统一出口
- [ ] 对外服务使用 TLS 1.2+，证书自动续期，开启 HSTS
- [ ] 内部服务间通信使用 TLS 或 mTLS
- [ ] 内部服务也要有认证，不依赖网络位置
- [ ] 定期审查防火墙和安全组规则，删除临时和过期的规则
- [ ] 公网入口前放置负载均衡/WAF，并具备基本的 DDoS 防护能力

## 6. 自测题

**Q1.** 为什么数据库已经设置了强密码，仍然不应该把端口开放到公网？

<details><summary>答案</summary>

纵深防御。密码只是一层防护，数据库软件本身可能存在认证绕过或远程代码执行漏洞，暴露在公网会让任何人都能尝试利用。另外配置变更可能意外关闭认证。限制网络访问能确保即使认证层出问题，攻击者也接触不到服务。

</details>

**Q2.** 什么是横向移动？网络分段如何限制它？

<details><summary>答案</summary>

横向移动是指攻击者拿下一台主机后，以它为跳板访问内网中的其他系统。在扁平网络中，一台被攻陷的 Web 服务器可以直接连接所有数据库、管理系统和办公网。网络分段把系统划分到不同区域，只允许必要的流量通过，攻击者就无法从一个区域随意进入另一个区域。

</details>

**Q3.** 为什么要限制服务器的出站流量？

<details><summary>答案</summary>

很多攻击在得手后需要向外连接：下载更多工具、建立远程控制通道、把数据传出去。如果服务器只能访问少数必要的外部地址，这些行为就会被阻止或被发现。限制出站也能减轻 SSRF 的影响。

</details>

**Q4.** 零信任的核心思想是什么？

<details><summary>答案</summary>

“永不信任，始终验证”。不因为请求来自内网就信任它，每次访问都要基于身份（用户身份、设备状态、服务身份）进行认证和授权，并且只授予最小的访问权限。网络位置不再作为信任的依据。

</details>

**Q5.** 为什么要禁用 TLS 1.0 和 1.1？

<details><summary>答案</summary>

TLS 1.0 和 1.1 依赖已经过时的加密算法和构造方式，存在多个已知的协议层面弱点，并且已经被 IETF 正式弃用（RFC 8996）。主流浏览器也已经停止支持。保留它们只会扩大攻击面，并可能允许降级攻击。

</details>

## 7. 延伸阅读与练习

- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [Mozilla Server Side TLS 指南](https://wiki.mozilla.org/Security/Server_Side_TLS)
- [NIST SP 800-207：零信任架构](https://csrc.nist.gov/pubs/sp/800/207/final)
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)
- 练习：用 SSL Labs 测试自己的网站并把评分提升到 A；审查自己云账号中所有安全组，删除或收紧所有 `0.0.0.0/0` 的非 HTTPS 入站规则
