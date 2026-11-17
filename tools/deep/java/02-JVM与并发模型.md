# 精讲：把 Tomcat 线程池读成「pm.max_children 的另一种写法」

第 02 章讲了 JVM 与并发模型。这一节给 PHP 架构师一个可以直接带进评审的对照框架：**Spring Boot 的并发旋钮几乎都能在你的 fpm 经验里找到影子，只是名字和默认值不同**。

## 1. 一张对照表顶半章书

| 概念 | PHP-FPM | Spring Boot（Tomcat） | 评审追问 |
|---|---|---|---|
| 并发单位 | worker 进程 | **线程**（默认平台线程，Boot 3.2+ 可选虚拟线程） | 「用平台线程还是虚拟线程？为什么」 |
| 并发上限 | `pm.max_children` | `server.tomcat.threads.max`（默认 200） | 「200 线程 × 栈 1MB = 200MB 栈内存，算过吗」 |
| 排队 | listen backlog | `server.tomcat.accept-count`（默认 100） | 「排队满了是拒绝还是等？」 |
| 请求隔离 | 进程隔离，天然 | **线程隔离但堆共享**：单例 Bean 的字段 = 全请求共享 | 「单例里有没有可变字段？」 |
| 请求态 | 请求生命周期 | `RequestContextHolder` / request scope Bean / 传参 | 「ThreadLocal 清了吗？」 |
| 内存回收 | 请求结束全释放 | GC 回收，但**泄漏会累积** | 「缓存上限？ThreadLocal remove？」 |
| CPU 吃满 | worker 数 | 线程数 > 核数靠调度；CPU 密集仍受核数限 | 「池大小按 IO 等待比算的吗」 |
| 崩溃半径 | 一个 worker | 一个线程异常通常只影响该请求；**OOM / StackOverflow 影响全进程** | 「OOM 时 dump 了吗」 |

**最重要的那一行是「请求隔离」**：PHP 的进程隔离让你从来不用想「单例里存了本次请求的用户」这件事；Spring 的单例 Bean 是**全进程一份**，往里写请求态就是并发 bug。这和 Node 模块顶层变量、Python 模块全局是**同一个坑的三种方言**。

## 2. 线程池大小的算法：和 fpm 同源，但多一个「等待比」

```text
线程数 ≈ 核数 × (1 + 等待时间 / 计算时间)
例：8 核，请求 100ms 中 90ms 等 DB → 8 × (1 + 9) = 80 线程
再被 DB 池上限截断：池 20 → 有效并发 20，多余线程只是在等池
```

PHP 里你算 `max_children` 时其实也在做同一件事，只是 DB 连接通常每请求一条，所以「进程数 ≈ 连接数」自动对齐。Spring 里线程池和 DB 池是**两个独立旋钮**，不对齐就会出现「200 线程抢 20 连接」的排队地狱——P99 暴涨但 CPU 很闲。

评审动作：让对方给出 `threads.max`、Hikari `maximumPoolSize`、DB `max_connections` 三个数字，并验证 `进程数 × Hikari ≤ DB 上限 × 0.8`。

## 3. 虚拟线程（Java 21+）：不是「更快的线程」，是「更便宜的阻塞」

| 维度 | 平台线程 | 虚拟线程 |
|---|---|---|
| 成本 | ~1MB 栈 + OS 调度 | ~KB 级，JVM 调度 |
| 阻塞代价 | 占住 OS 线程 | **卸载**载体线程，几乎免费 |
| 适合 | CPU 密集、需要精确控制 | IO 密集、高并发、`synchronized` 少的代码 |
| 陷阱 | 池大小要算 | `synchronized` 长段 / native 调用会 **pin** 载体线程；ThreadLocal 滥用放大内存 |

PHP 对照：虚拟线程让你用「同步直白写法」拿到「异步的并发度」——相当于 Swoole 协程把同步 curl 变成协程调度，但**不需要改代码风格**。这正是 Java 相对 Node/Python 的差异化卖点：不必把全栈改成 async/await。

评审追问：「Boot 4 默认开虚拟线程了吗？`spring.threads.virtual.enabled` 是什么值？pin 监控有吗？」

## 4. JVM 内存：把「请求结束全释放」换成「GC  pauses 预算」

| 区域 | 存什么 | PHP 里有对应吗 | 出事症状 |
|---|---|---|---|
| 堆（Young/Old） | 对象 | 请求内变量（但常驻） | GC 停顿、OOM |
| Metaspace | 类元数据 | OPcache 的类表 | 动态类生成泄漏 → Metaspace OOM |
| 线程栈 | 每线程局部 | worker 栈 | StackOverflow（深递归） |
| 直接内存 | NIO buffer | 无 | 堆外 OOM，heap dump 看不到 |

三个 PHP 老手陌生的生产动作：

1. **GC 停顿是 SLO 的一部分**：G1 默认目标 200ms；P99 敏感服务要看 GC 日志或换 ZGC（亚毫秒）。PHP 没有「全进程停顿」概念（每请求独立），这是常驻 JVM 的新税。
2. **OOM 要留现场**：`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=…`。没有 dump 的 OOM 等于没发生过。
3. **容器里要认 cgroup**：JDK 10+ 默认感知容器内存；`-Xmx` 不设时按容器比例 ergonomics。K8s limits 与 Xmx 不匹配 = OOMKilled(137) 或 GC 疯狂。

## 5. 评审清单

```text
[ ] 单例 Bean 无可变请求态；ThreadLocal 有 remove
[ ] threads.max / Hikari / DB 上限三数对齐
[ ] 虚拟线程开关明确；synchronized 长段与 pin 有评估
[ ] GC 选型与 P99 目标匹配；GC 日志或指标可见
[ ] HeapDumpOnOOM 开启；容器 limits 与 Xmx 对齐
[ ] 优雅停机：server.shutdown=graceful + timeout ≥ 在途上限
```