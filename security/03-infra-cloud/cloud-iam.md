# 云 IAM 与云配置安全

> 方向：基础设施 · 相关标准：CIS 云平台基线（AWS/GCP/Azure Foundations Benchmark）、OWASP A01:2025、A02:2025、CWE-269（权限管理不当） · 最后更新：2026-10-22

## 1. 核心要点

- **保护根账号/超级管理员**：开启 MFA，不创建访问密钥，日常不使用，只在必须时登录。
- **人用 SSO，程序用角色**：人员通过身份提供方（SSO）登录并获取临时权限；程序使用实例角色、工作负载身份、OIDC 联合，**避免长期访问密钥**。
- **最小权限**：策略中避免 `"Action": "*"` 和 `"Resource": "*"`，从只读或具体权限开始，根据实际使用情况收紧。
- **防止数据公开**：对象存储默认阻止公开访问，数据库、快照、镜像不对外共享。
- **全面审计**：所有账号、所有区域开启审计日志（如 AWS CloudTrail），日志存到单独的、受保护的账号中，并对高危操作设置告警。

## 2. 为什么重要

- **成因**：为了省事给了管理员权限；长期访问密钥写在代码或 CI 里，多年不轮换；对象存储为了分享文件设成了公开；没有开审计日志。
- **影响**：一个泄露的高权限密钥可以让攻击者删除所有资源、导出所有数据、大量创建资源（常用于挖矿）；公开的存储桶导致大规模数据泄露。云上的很多重大事件，根源都是身份与权限问题，而不是复杂的技术漏洞。
- **标准**：[CIS AWS Foundations Benchmark](https://www.cisecurity.org/benchmark/amazon_web_services)、[AWS IAM 最佳实践](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

## 3. 常见错误 vs 正确做法

以下以 AWS 为例，GCP、Azure 和国内云厂商有对应的概念（角色、服务账号、托管身份、策略）。

**策略过于宽泛**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:*", "Resource": "*" }
  ]
}
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadUploadsBucketOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::myapp-uploads/*"
    }
  ]
}
```

**信任策略：限制谁能扮演这个角色（GitHub Actions OIDC）**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

如果漏写 `sub` 条件，任何 GitHub 仓库的工作流都可能扮演这个角色。

**对象存储默认阻止公开访问**

```bash
# 在账号级别阻止所有 S3 公开访问
aws s3control put-public-access-block \
  --account-id 123456789012 \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

需要对外分享文件时，使用有过期时间的预签名 URL，或者通过 CDN 只暴露特定路径。

**用组织级策略设置“护栏”**

在 AWS Organizations 中可以用服务控制策略（SCP）设定所有账号都不能越过的边界，例如：禁止关闭 CloudTrail、禁止在未使用的区域创建资源、禁止删除日志存储桶。即使某个账号里有人拥有管理员权限，也无法违反这些限制。

## 4. 如何识别

```bash
# 查看当前凭证是谁
aws sts get-caller-identity

# 生成凭证报告，检查根账号 MFA、长期未使用的用户和访问密钥
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text | base64 -d

# 列出某个用户的访问密钥和创建时间
aws iam list-access-keys --user-name some-user
```

- 用 **IAM Access Analyzer** 找出被共享到外部的资源，以及根据实际使用情况生成最小权限策略。
- 查看“上次访问”信息（Last Accessed），删除长期未使用的权限、用户和角色。
- 检查策略中的通配符、`iam:PassRole` 加上 `Resource: "*"`、能修改 IAM 本身的权限（可能被用来提升权限）。
- 检查所有存储桶、快照、镜像的共享设置。
- 用开源工具做整体评估，例如 [Prowler](https://github.com/prowler-cloud/prowler)、[ScoutSuite](https://github.com/nccgroup/ScoutSuite)（只在自己的或已授权的账号上运行）。

## 5. 防御清单

- [ ] 根账号开启 MFA（优先硬件密钥/Passkey），没有访问密钥，日常不使用
- [ ] 人员通过 SSO 登录，使用临时凭证，按职责分配权限集
- [ ] 程序使用角色、工作负载身份或 OIDC 联合，避免长期访问密钥
- [ ] 必须存在的长期密钥定期轮换，并监控使用情况
- [ ] 策略遵循最小权限，避免 `Action: "*"`、`Resource: "*"`
- [ ] 严格控制 `iam:*`、`iam:PassRole`、`sts:AssumeRole` 等可能导致权限提升的操作
- [ ] 角色的信任策略限制具体的主体和条件（如 OIDC 的 `sub`）
- [ ] 账号级别阻止对象存储公开访问，对外分享使用预签名 URL
- [ ] 所有区域开启审计日志，日志存放在单独的账号中，开启防篡改保护
- [ ] 对高危操作设置告警：根账号登录、关闭审计日志、修改 IAM 策略、创建访问密钥
- [ ] 用组织级策略（SCP 等）设置护栏
- [ ] 开发、测试、生产使用不同的账号隔离
- [ ] 设置费用告警，异常费用往往是被滥用的第一信号

## 6. 自测题

**Q1.** 为什么推荐使用角色和临时凭证，而不是 IAM 用户的长期访问密钥？

<details><summary>答案</summary>

长期访问密钥一旦泄露，在被发现和吊销之前一直有效，而且很容易被写进代码、配置、CI 中而长期遗忘。临时凭证有效期通常只有几十分钟到几小时，泄露后的窗口很短，也不需要存储和轮换。角色还可以通过信任策略限制谁能使用它。

</details>

**Q2.** `iam:PassRole` 权限为什么可能导致权限提升？

<details><summary>答案</summary>

`iam:PassRole` 允许把一个角色交给云服务使用（如给 EC2 实例或 Lambda 函数绑定角色）。如果一个低权限用户可以把高权限角色交给自己能控制的服务（比如创建一台 EC2 并绑定管理员角色），他就能在这个服务里以高权限角色的身份执行操作，间接获得高权限。所以 `PassRole` 应该限定在具体的角色上。

</details>

**Q3.** 配置 GitHub Actions 的 OIDC 信任策略时，漏掉 `sub` 条件会怎样？

<details><summary>答案</summary>

`sub` 条件限定了哪个仓库、哪个分支或环境可以扮演这个角色。漏掉它（或者只校验了 `aud`）意味着任何 GitHub 仓库的工作流都可能获取到这个角色的凭证，包括攻击者自己创建的仓库。

</details>

**Q4.** 为什么审计日志要存放在单独的账号中？

<details><summary>答案</summary>

如果日志和业务资源在同一个账号，攻击者获得该账号的高权限后，可以删除或关闭日志来掩盖行踪。日志存到单独的、权限严格控制的账号中，再配合对象锁定等防篡改机制，即使业务账号被完全控制，日志依然可信，可以用于调查。

</details>

**Q5.** 需要把一个文件分享给外部合作方，应该怎么做，而不是把存储桶设为公开？

<details><summary>答案</summary>

生成有过期时间的预签名 URL，只授权访问这一个对象；或者通过 CDN 加签名 URL/签名 Cookie 来分发；如果对方也在同一云平台，可以通过跨账号的资源策略只授权给对方的特定角色。存储桶本身保持“阻止公开访问”。

</details>

## 7. 延伸阅读与练习

- [AWS IAM 安全最佳实践](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Google Cloud IAM 最佳实践](https://cloud.google.com/iam/docs/using-iam-securely)
- [Azure 身份管理最佳实践](https://learn.microsoft.com/en-us/azure/security/fundamentals/identity-management-best-practices)
- [CIS Benchmarks（云平台）](https://www.cisecurity.org/cis-benchmarks)
- [Prowler](https://github.com/prowler-cloud/prowler)
- 练习：[flAWS](http://flaws.cloud/) 和 [flAWS2](http://flaws2.cloud/)（专为学习而设计的公开练习，分别从攻击方和防守方视角理解 AWS 常见错配）；在自己的测试账号中运行 Prowler，处理所有高危项
