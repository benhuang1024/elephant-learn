# 容器安全

> 方向：基础设施 · 相关标准：CIS Docker Benchmark、NIST SP 800-190（应用容器安全指南）、CWE-250 · 最后更新：2026-10-22

## 1. 核心要点

- **容器不是安全边界很强的虚拟机**，它和宿主机共享内核。配置不当时，容器内的问题可以直接影响宿主机。
- **镜像**：使用可信的、精简的基础镜像（distroless、Alpine、slim 版本、官方镜像），固定版本（最好固定到 digest），定期重建以获取补丁。
- **运行时**：以**非 root** 用户运行，**不使用 `--privileged`**，删除不需要的 Linux capabilities，根文件系统设为只读。
- **不要挂载 Docker socket**（`/var/run/docker.sock`）到容器里，这等于给了容器宿主机的 root 权限。
- **扫描**：构建流程中扫描镜像漏洞和 Dockerfile 配置问题，推送前拦截高危问题。

## 2. 为什么重要

- **成因**：Dockerfile 默认以 root 运行；为了解决权限问题直接加 `--privileged`；基础镜像庞大且长期不更新；为了方便挂载宿主机目录和 Docker socket。
- **影响**：应用漏洞加上过高的容器权限，可能导致容器逃逸，进而控制宿主机和同一主机上的其他容器；镜像中的已知漏洞被利用；镜像层中残留的密钥泄露。
- **标准**：[NIST SP 800-190](https://csrc.nist.gov/pubs/sp/800/190/final)、[CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)

## 3. 常见错误 vs 正确做法

**Dockerfile**

```dockerfile
# 错误示例（注释形式列出）：
# FROM python:latest            -> 标签不固定，镜像大，包含很多不需要的工具
# COPY . .                      -> 可能把 .git、.env、测试数据一起复制进去
# RUN pip install -r requirements.txt
# CMD python app.py             -> 默认以 root 运行
```

```dockerfile
# 正确：多阶段构建 + 精简运行镜像 + 非 root 用户
FROM python:3.11-slim-bookworm AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes --target /deps -r requirements.txt
COPY src/ ./src/

FROM gcr.io/distroless/python3-debian12:nonroot
WORKDIR /app
COPY --from=build /deps /deps
COPY --from=build /app/src ./src
ENV PYTHONPATH=/deps
USER nonroot
ENTRYPOINT ["python3", "-m", "src.app"]
```

构建阶段的 Python 版本和发行版要和运行镜像一致（distroless 的 `python3-debian12` 基于 Debian 12 和它自带的 Python 3.11），否则编译出的原生扩展可能无法加载。生产中可以把 `FROM` 固定到 digest（`image@sha256:...`），由 Renovate/Dependabot 负责更新。

**`.dockerignore`**

```text
.git
.env
*.pem
node_modules
tests/
```

**运行参数**

```bash
# 错误：特权模式 + 挂载 Docker socket
# docker run --privileged -v /var/run/docker.sock:/var/run/docker.sock myapp

# 正确：最小权限运行
docker run \
  --user 10001:10001 \
  --read-only \
  --tmpfs /tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --memory 512m --cpus 1 --pids-limit 200 \
  -p 127.0.0.1:8080:8080 \
  myapp:1.2.3
```

- `--cap-drop ALL`：删除所有 Linux capabilities，确实需要的再用 `--cap-add` 单独加回
- `--read-only`：根文件系统只读，需要写入的目录用 tmpfs 或卷挂载
- `--memory`、`--pids-limit`：防止一个容器耗尽宿主机资源
- `-p 127.0.0.1:8080:8080`：只在本机暴露端口。注意 Docker 发布的端口会绕过 ufw 等主机防火墙规则

**扫描镜像和 Dockerfile**

```bash
# 镜像漏洞扫描，发现 HIGH 及以上的漏洞时返回非零退出码（适合在 CI 中阻断）
trivy image --severity HIGH,CRITICAL --exit-code 1 myapp:1.2.3

# Dockerfile 规范检查
hadolint Dockerfile
```

## 4. 如何识别

- 检查 Dockerfile：有没有 `USER` 指令？基础镜像是否固定版本？是否复制了不必要的文件？
- 检查正在运行的容器：
  - `docker inspect --format '{{.Config.User}}' <容器>`：是否以 root 运行（空值表示 root）
  - `docker inspect --format '{{.HostConfig.Privileged}}' <容器>`：是否特权模式
  - `docker inspect --format '{{json .Mounts}}' <容器>`：是否挂载了 `docker.sock` 或宿主机敏感目录
- 检查 docker-compose 文件中的 `privileged: true`、`network_mode: host`、`pid: host`、敏感目录挂载。
- 用 Trivy 扫描镜像漏洞，用 `docker history --no-trunc` 检查镜像层中是否有密钥。
- 运行 [Docker Bench for Security](https://github.com/docker/docker-bench-security) 对照 CIS 基线检查宿主机配置。

## 5. 防御清单

- [ ] 使用官方或可信来源的精简基础镜像，固定版本或 digest
- [ ] 使用多阶段构建，运行镜像中不包含编译器、包管理器和调试工具
- [ ] 配置 `.dockerignore`，镜像中不包含 `.git`、`.env`、私钥等
- [ ] 镜像中不包含密钥，构建时使用 BuildKit secret 挂载
- [ ] 容器以非 root 用户运行
- [ ] 不使用 `--privileged`，删除所有不需要的 capabilities
- [ ] 开启 `no-new-privileges`，根文件系统只读
- [ ] 设置 CPU、内存、进程数限制
- [ ] 不挂载 Docker socket 和宿主机的敏感目录
- [ ] CI 中扫描镜像和 Dockerfile，高危漏洞阻止发布
- [ ] 定期重建镜像以获取基础镜像的安全更新
- [ ] 宿主机保持更新，可以考虑开启 Docker rootless 模式或 user namespace 重映射

## 6. 自测题

**Q1.** 为什么说容器的隔离性弱于虚拟机？

<details><summary>答案</summary>

虚拟机有独立的内核，通过硬件虚拟化与宿主机隔离。容器共享宿主机的内核，隔离依赖于 namespace、cgroup、capabilities、seccomp 等内核机制。内核漏洞或配置不当（特权模式、危险挂载）都可能让容器内的进程影响宿主机。需要强隔离时可以使用 gVisor、Kata Containers 等方案。

</details>

**Q2.** 为什么挂载 `/var/run/docker.sock` 等于给了容器 root 权限？

<details><summary>答案</summary>

通过 Docker socket 可以调用 Docker API，比如创建一个新的特权容器并挂载宿主机的根目录。所以能访问 socket 的容器可以间接完全控制宿主机。即使挂载为只读也没用，因为只读只限制文件本身，并不限制通过 socket 发送 API 请求。

</details>

**Q3.** 容器里以 root 运行有什么风险？已经在容器里了，root 不就只是“容器里的 root”吗？

<details><summary>答案</summary>

默认情况下（没有开启 user namespace 重映射或 rootless 模式），容器里的 root 就是宿主机上 UID 为 0 的用户，只是被 capabilities、seccomp 等机制限制了。一旦出现容器逃逸漏洞，或者挂载了宿主机目录，容器内的 root 就能以 root 身份影响宿主机。以非 root 运行可以显著提高攻击难度。

</details>

**Q4.** 多阶段构建对安全有什么好处？

<details><summary>答案</summary>

构建阶段需要的编译器、包管理器、源码、构建缓存不会出现在最终镜像里。最终镜像更小，包含的软件包更少，漏洞也更少，攻击者即使进入容器，也缺少可利用的工具。同时降低了构建过程中用到的凭证残留在最终镜像中的风险。

</details>

**Q5.** 为什么镜像扫描“今天没有漏洞”，也需要定期重建镜像？

<details><summary>答案</summary>

漏洞会不断被发现。今天干净的镜像，几周后它包含的系统库可能就有了新的 CVE。定期用最新的基础镜像重建，才能获取这些修复。所以要持续扫描运行中的镜像，并且自动化地重建和发布。

</details>

## 7. 延伸阅读与练习

- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [Docker 官方文档：Security](https://docs.docker.com/engine/security/)
- [NIST SP 800-190](https://csrc.nist.gov/pubs/sp/800/190/final)
- [Trivy](https://trivy.dev/)、[Hadolint](https://github.com/hadolint/hadolint)、[Docker Bench for Security](https://github.com/docker/docker-bench-security)
- 练习：选一个自己的项目镜像，用 Trivy 扫描并记录漏洞数量；按本篇清单改写 Dockerfile（多阶段构建、精简基础镜像、非 root），再次扫描并对比镜像大小和漏洞数量
