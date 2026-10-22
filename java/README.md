# Java + Spring 速成：写给 10 年 PHP 架构师

> 目标读者：精通 PHP / Laravel（或 Symfony），做过架构设计，想在 **2～3 周** 内能读懂、评审、设计 Java + Spring Boot 项目。
> 技术栈：**Java 25（LTS）+ Spring Boot 4.1 / Spring Framework 7 + Maven**。

这不是一本从 `Hello World` 讲起的教程。每一章都遵循同一个套路：

```
PHP/Laravel 的写法  →  Java/Spring 的写法  →  关键差异与坑
```

你已经懂的东西（HTTP、REST、ORM、依赖注入、事务、缓存、队列）只做映射；
真正花时间的是 **PHP 人的直觉会失效的地方**：常驻进程与线程安全、静态类型与泛型、IoC 容器与动态代理、JPA 的持久化上下文。

## 学习路线

| 章节 | 内容 | 建议用时 | 重要度 |
|---|---|---|---|
| [00 环境与工具链](docs/00-环境与工具链.md) | JDK、SDKMAN、IntelliJ、Maven Wrapper | 0.5 天 | ★★ |
| [01 Java 语言速通](docs/01-Java语言速通.md) | 类型、record、enum、sealed、泛型、Optional、异常、集合、Stream | 2 天 | ★★★★★ |
| [02 JVM 与并发模型](docs/02-JVM与并发模型.md) | share-nothing vs 共享内存、线程、虚拟线程、GC | 1 天 | ★★★★★ |
| [03 Maven 与项目结构](docs/03-Maven与项目结构.md) | composer ↔ pom、scope、BOM、依赖冲突、打包 | 0.5 天 | ★★★ |
| [04 Spring 核心：IoC 与配置](docs/04-Spring核心-IoC与配置.md) | 容器、Bean、作用域、Profile、配置绑定 | 1.5 天 | ★★★★★ |
| [05 Web 与 REST](docs/05-Web与REST.md) | Controller、校验、异常处理、Filter/Interceptor | 1 天 | ★★★★ |
| [06 数据访问与事务](docs/06-数据访问与事务.md) | JPA/Hibernate、Spring Data、Flyway、事务、N+1、乐观锁 | 2 天 | ★★★★★ |
| [07 AOP 与代理原理](docs/07-AOP与代理原理.md) | 为什么 `@Transactional` 会失效 | 0.5 天 | ★★★★ |
| [08 测试](docs/08-测试.md) | JUnit、Mockito、切片测试、Testcontainers | 1 天 | ★★★★ |
| [09 安全](docs/09-安全.md) | Spring Security 过滤器链、JWT、方法鉴权 | 1 天 | ★★★ |
| [10 生产化](docs/10-生产化.md) | Actuator、日志、配置外置、Docker、JVM 参数 | 1 天 | ★★★★ |
| [11 架构师视角](docs/11-架构师视角.md) | 缓存、消息、模块化单体、微服务、团队迁移策略 | 1 天 | ★★★★ |
| [附录 PHP → Java 速查表](docs/附录-PHP到Java速查表.md) | 语法 / 函数 / 生态 / 常见坑 一页对照 | 随时查 | ★★★★★ |

**最短路径**（只有 3 天）：01 → 02 → 04 → 06 → 07 → 附录。

## 配套代码

[`code/lang-basics/`](code/lang-basics/) 是第 01、02 章的示例代码：每个主题一个类，类注释里写了对应的 PHP 写法。

| 主题 | 文件 |
|---|---|
| record 值对象 / BigDecimal | [Money.java](code/lang-basics/src/main/java/study/basics/Money.java) |
| sealed + 模式匹配 | [Shapes.java](code/lang-basics/src/main/java/study/basics/Shapes.java) |
| enum 与状态机 | [OrderStatus.java](code/lang-basics/src/main/java/study/basics/OrderStatus.java) |
| 泛型 / 通配符 | [Generics.java](code/lang-basics/src/main/java/study/basics/Generics.java) |
| null 与 Optional | [NullSafety.java](code/lang-basics/src/main/java/study/basics/NullSafety.java) |
| Stream ≈ array_* / Collection | [StreamsVsArrayFunctions.java](code/lang-basics/src/main/java/study/basics/StreamsVsArrayFunctions.java) |
| 受检 / 非受检异常 | [Exceptions.java](code/lang-basics/src/main/java/study/basics/Exceptions.java) |
| 并发、虚拟线程、进程内缓存 | [Concurrency.java](code/lang-basics/src/main/java/study/basics/Concurrency.java) |
| 字符串与 `==` 陷阱 | [StringsAndEquality.java](code/lang-basics/src/main/java/study/basics/StringsAndEquality.java) |
| 单文件脚本（像 `php a.php`） | [scripts/Hello.java](code/lang-basics/scripts/Hello.java) |

Spring 部分（04～11 章）不附带完整工程，代码以章节内的片段为准；想动手时按 [00 章](docs/00-环境与工具链.md#用-spring-initializr-生成项目) 用 Spring Initializr 生成一个空项目，把片段粘进去即可。

> 说明：配套代码已用 JDK 26 以 `--release 25` 编译通过，并验证了各示例的行为（如 `UnsafeCounter` 8 线程各累加 10 万次只得到约 16 万，`AtomicCounter` 准确得到 80 万；1000 个虚拟线程各 sleep 100ms 总耗时约 120ms）。尚未在 JDK 25 上运行，也未通过 Maven 构建。

## 学习建议

1. **先装 IntelliJ IDEA**。Java 的生产力一半来自 IDE：自动导入、重构、跳转到框架源码、调试 Spring 容器。用 VS Code 写 Java 会让你低估这门语言。
2. **读源码而不是背注解**。在 IDEA 里 `Cmd+B` 进入 `@Transactional`、`DispatcherServlet` 的实现，比读十篇博客有用。
3. **用“请求生命周期”串起所有知识**：一个 HTTP 请求从 Tomcat 线程池 → Filter 链 → DispatcherServlet → Interceptor → Controller → 代理后的 Service（事务开启）→ Repository（Hibernate Session）→ 返回 → 事务提交 → JSON 序列化。能把这条链讲清楚，就算入门了。
