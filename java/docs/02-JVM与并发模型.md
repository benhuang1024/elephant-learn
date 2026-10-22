# 02 JVM 与并发模型 —— PHP 架构师最需要“换脑子”的一章

> 配套代码：[Concurrency.java](../code/lang-basics/src/main/java/study/basics/Concurrency.java)

## 1. 两种运行模型

```
PHP-FPM（share-nothing）                    Spring Boot（常驻进程 + 线程池）
─────────────────────────                   ──────────────────────────────────
nginx                                        (nginx / 网关)
  │                                            │
php-fpm master                               一个 JVM 进程（启动一次，运行数周）
  ├─ worker 进程 1 ── 请求 A                   ├─ 堆内存：所有对象共享
  ├─ worker 进程 2 ── 请求 B                   │    Spring 容器、单例 Bean、连接池、缓存……
  └─ worker 进程 3 ── 请求 C                   └─ Tomcat 线程池（默认 200 个线程）
                                                    ├─ 线程 1 ── 请求 A ┐
每个请求：                                           ├─ 线程 2 ── 请求 B ├─ 同时访问同一批对象
  bootstrap → 处理 → 释放全部内存                    └─ 线程 3 ── 请求 C ┘
```

| 维度 | PHP-FPM | Java / Spring Boot |
|---|---|---|
| 生命周期 | 每个请求重新启动框架 | 进程启动一次（几秒），之后常驻 |
| 内存 | 请求结束全部释放，泄漏无所谓 | 一直存活，**泄漏会累积直到 OOM** |
| 状态 | 天然隔离 | 对象被所有请求线程 **共享** |
| 静态变量 | 请求级生命周期 | **进程级生命周期**，全局共享 |
| 连接 | 每请求建连（或 pconnect） | 连接池（HikariCP）复用 |
| 进程内缓存 | 只能用 APCu / OPcache | 直接放在堆里（Caffeine） |
| 启动成本 | 每次请求都付 | 只付一次，所以可以做重量级初始化 |
| 并发单位 | 进程 | 线程（平台线程 / 虚拟线程） |

如果你用过 **Swoole / RoadRunner / Octane**，你已经踩过这些坑：Octane 文档里“不要在单例里保存请求状态”的警告，在 Java 里是日常。

## 2. 线程安全：三条规则就够用

### 规则一：单例 Bean 不要有可变的实例字段

```java
@Service
public class ReportService {
    private User currentUser;          // ❌ 所有请求共享这一个字段！A 请求会读到 B 请求的用户

    public Report build(User user) {
        this.currentUser = user;       // ❌
        ...
    }
}
```

Spring 的 Bean 默认是 **单例**（整个进程一个实例）。请求相关的数据只能放在 **方法参数和局部变量** 里（局部变量在线程栈上，天然线程隔离）。

### 规则二：必须共享的可变状态，用并发工具

见配套代码中的 `UnsafeCounter` / `AtomicCounter` / `SynchronizedCounter`：

```java
private int count;
public void increment() { count++; }    // ❌ 读-改-写不是原子操作，多线程下丢更新

private final AtomicInteger count = new AtomicInteger();
public void increment() { count.incrementAndGet(); }   // ✅ CAS 原子操作
```

| 需求 | 工具 |
|---|---|
| 计数器、序号 | `AtomicInteger` / `AtomicLong` / `LongAdder` |
| 共享 Map / 进程内缓存 | `ConcurrentHashMap`（`computeIfAbsent` 原子加载） |
| 临界区 | `synchronized` 或 `ReentrantLock` |
| 不可变数据 | `record` + `List.copyOf` —— **最好的线程安全就是不可变** |

### 规则三：跨实例（多台机器）的并发，用数据库或 Redis

`synchronized` 只在 **一个 JVM 内** 有效。部署 3 个实例时，扣库存这种操作仍需要数据库行锁、乐观锁（第 06 章）或 Redis 分布式锁。这一点和 PHP 是一样的。

### 补充：可见性与有序性 —— 只有原子性还不够

`count++` 除了“读-改-写不原子”，还有第二个问题：一个线程写入的值，另一个线程**不保证立刻看见**。CPU 缓存、编译器与 JIT 重排都可能让读线程一直读到旧值：

```java
private boolean running = true;            // ❌ 工作线程可能永远看不到 false
private volatile boolean running = true;   // ✅ 保证可见性，并禁止相关重排序
```

必须记住的几条：

- `volatile` 只保证 **可见性 + 有序性**，**不保证** `i++` 的原子性。
- `synchronized`、`Atomic*`、`ConcurrentHashMap` 的读写会建立 **happens-before** 关系 —— 原子性和可见性一起解决。
- `Thread.start()` / `Thread.join()` / `Future.get()` 也建立 happens-before：主线程在 `start()` 前的写入，对新线程可见。
- 不可变对象（`final` 字段 + 安全发布）不需要额外同步 —— 这是 `record` DTO 的最大优势之一。
- 双重检查锁（DCL）单例的实例字段必须是 `volatile`，否则可能发布一个“构造未完成”的对象。

配套代码中的 `AtomicCounter` 与 `SynchronizedCounter` 都同时解决了原子性和可见性；
`UnsafeCounter.count++` 两者都不满足。

## 3. ThreadLocal：Java 版的“请求上下文”

PHP 里 `$request`、`Auth::user()` 天然是当前请求的。Java 中框架用 **ThreadLocal**（每个线程一份的变量）实现同样效果：

- Spring Security 的 `SecurityContextHolder` —— 当前登录用户
- `RequestContextHolder` —— 当前 HTTP 请求
- Spring 事务管理器 —— 当前线程绑定的数据库连接
- 日志 MDC —— 当前请求的 traceId

两个后果：

1. **在新线程里（`@Async`、线程池、`CompletableFuture`）拿不到这些上下文**，事务也不会传播过去。
2. 自己用 ThreadLocal 时，线程是被线程池复用的，**用完必须 `remove()`**，否则下一个请求会读到上一个请求的数据。

Java 25 正式引入了 **ScopedValue** 作为更安全的替代（不可变、作用域结束自动失效），新代码优先考虑。

## 4. 虚拟线程（Java 21+）

传统 Java 线程 = 操作系统线程，每个约占 1MB 栈，几千个就到头了。所以 Tomcat 默认 200 线程，遇到慢下游（调外部 API 2 秒）时线程池很快被占满。

**虚拟线程** 由 JVM 调度，非常轻量，可以开几十万个；遇到阻塞 IO 时自动挂起、让出底层线程。代码仍是普通的同步阻塞写法：

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    var user  = executor.submit(() -> userClient.get(id));      // 并发调用三个下游
    var order = executor.submit(() -> orderClient.list(id));
    var score = executor.submit(() -> scoreClient.get(id));
    return new Profile(user.get(), order.get(), score.get());
}
```

在 Spring Boot 中只需一行配置，让 Tomcat 用虚拟线程处理每个请求：

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

对比 PHP：效果类似 Swoole 协程，但 **不需要改写成协程风格**，也不需要协程化的客户端库，JDBC、HTTP 客户端都能直接用。

注意：虚拟线程解决的是 “IO 等待占线程” 的问题，不会让 CPU 密集型任务变快；数据库连接池大小仍是真正的并发上限。

## 5. 内存与 GC 基础

| 概念 | 说明 |
|---|---|
| 堆（Heap） | 所有对象在这里，`-Xmx` 设置上限。超出 → `OutOfMemoryError` |
| 栈（Stack） | 每个线程一份，存局部变量和调用帧。递归太深 → `StackOverflowError` |
| GC | 自动回收不可达对象。Java 25 默认 G1，低延迟场景用 ZGC |
| Metaspace | 类元数据 |

PHP 架构师需要警惕的内存泄漏模式（在 PHP 中不是问题）：

- 往 `static Map` 里不断 put 而不清理（“我只是做个缓存”）→ 用有上限、有过期的 Caffeine。
- ThreadLocal 未 remove。
- 监听器 / 回调注册后不注销。

容器部署时，用 `-XX:MaxRAMPercentage=75` 让 JVM 按容器内存比例设置堆，而不是写死 `-Xmx`（第 10 章）。

## 6. JIT 与预热

JVM 先解释执行字节码，再把热点代码编译成本地机器码（JIT）。所以：

- **刚启动时比较慢**，跑一段时间后性能才到峰值。压测前要预热。
- 启动时间（几秒）比 PHP 请求冷启动长得多，但只付一次。
- 对启动时间敏感（Serverless、CLI）时，可以考虑 GraalVM Native Image 或 Java 25 的 AOT 缓存（Project Leyden）。

## 7. 本章自测

1. 为什么在 Spring 的 `@Service` 里写 `private List<String> errors = new ArrayList<>();` 来收集本次请求的校验错误是错误的？应该怎么改？
2. 一个接口内部串行调用 3 个耗时 300ms 的外部服务，如何在不引入响应式框架的情况下把延迟降到约 300ms？
3. 部署 4 个实例，`synchronized` 能防止超卖吗？

<details>
<summary>参考答案</summary>

1. Service 是单例，字段被所有并发请求共享，会互相污染且线程不安全。改为方法内的局部变量，或作为返回值返回。
2. 用虚拟线程执行器并发提交三个调用再汇总（见第 4 节）；或使用 `CompletableFuture`。
3. 不能。`synchronized` 只在单个 JVM 内有效，需要数据库条件更新 / 乐观锁 / 分布式锁。
</details>
