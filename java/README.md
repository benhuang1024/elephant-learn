# Java + Spring 速成：写给 10 年 PHP 架构师

> 目标读者：精通 PHP / Laravel（或 Symfony），做过架构设计，想在 **2～3 周** 内能读懂、评审、设计 Java + Spring Boot 项目。
> 技术栈：**Java 25（LTS）+ Spring Boot 4.1.1（Spring Framework 7.0.9）+ Maven 3.9.16**。

这不是一本从 `Hello World` 讲起的教程。每一章都遵循同一个套路：

```
PHP/Laravel 的写法  →  Java/Spring 的写法  →  关键差异与坑
```

你已经懂的东西（HTTP、REST、ORM、依赖注入、事务、缓存、队列）只做映射；
真正花时间的是 **PHP 人的直觉会失效的地方**：常驻进程与线程安全、静态类型与泛型、IoC 容器与动态代理、JPA 的持久化上下文。

## 目录结构

```
java/
├── README.md                  # 本文件
├── docs/                      # 00～11 章 + 附录速查表
└── code/
    ├── lang-basics/           # 纯 Java 25：语言、集合、异常、并发（每主题一个类 + 一个测试）
    └── shop-api/              # Spring Boot 4：商品 + 订单，贯穿 IoC/Web/JPA/事务/AOP/测试/安全/Actuator
```

两个工程都是 **Maven + Wrapper**，不需要本机安装 Maven；首次运行会自动下载依赖。

## 环境准备

### JDK 25

推荐 SDKMAN（类似 phpenv，可在多个 JDK 间切换）：

```bash
curl -s "https://get.sdkman.io" | bash
sdk install java 25-tem
java -version
```

或者 Homebrew：

```bash
brew install openjdk@25
export JAVA_HOME="$(brew --prefix openjdk@25)/libexec/openjdk.jdk/Contents/Home"
```

> 本仓库的开发机只有 JDK 26，工程通过 `maven.compiler.release=25` 向下编译到 Java 25 字节码；
> **尚未在真正的 JDK 25 运行时上执行过**。你安装 JDK 25 后直接跑下面的命令即可。
> 只用 JDK 21 会失败：代码/构建目标要求 25。

### 可选工具

- **IntelliJ IDEA**：Java 的生产力一半来自 IDE（跳转框架源码、Bean 视图、HTTP 客户端）。
- **Docker**：只有 Testcontainers 测试和 PostgreSQL profile 需要；默认 H2 模式不需要。

## 快速开始

### 1. lang-basics：语言与并发

```bash
cd code/lang-basics
./mvnw test
```

每个主题一个类，测试就是“可执行笔记”：

| 主题 | 代码 | 测试 |
|---|---|---|
| record 值对象 / BigDecimal | [Money.java](code/lang-basics/src/main/java/study/basics/Money.java) | [MoneyTest.java](code/lang-basics/src/test/java/study/basics/MoneyTest.java) |
| sealed + 模式匹配 | [Shapes.java](code/lang-basics/src/main/java/study/basics/Shapes.java) | [ShapesTest.java](code/lang-basics/src/test/java/study/basics/ShapesTest.java) |
| enum 与状态机 | [OrderStatus.java](code/lang-basics/src/main/java/study/basics/OrderStatus.java) | [OrderStatusTest.java](code/lang-basics/src/test/java/study/basics/OrderStatusTest.java) |
| 泛型 / 通配符 | [Generics.java](code/lang-basics/src/main/java/study/basics/Generics.java) | [GenericsTest.java](code/lang-basics/src/test/java/study/basics/GenericsTest.java) |
| null 与 Optional | [NullSafety.java](code/lang-basics/src/main/java/study/basics/NullSafety.java) | [NullSafetyTest.java](code/lang-basics/src/test/java/study/basics/NullSafetyTest.java) |
| Stream ≈ Collection | [StreamsVsArrayFunctions.java](code/lang-basics/src/main/java/study/basics/StreamsVsArrayFunctions.java) | [StreamsVsArrayFunctionsTest.java](code/lang-basics/src/test/java/study/basics/StreamsVsArrayFunctionsTest.java) |
| 受检 / 非受检异常 | [Exceptions.java](code/lang-basics/src/main/java/study/basics/Exceptions.java) | [ExceptionsTest.java](code/lang-basics/src/test/java/study/basics/ExceptionsTest.java) |
| 并发、虚拟线程 | [Concurrency.java](code/lang-basics/src/main/java/study/basics/Concurrency.java) | [ConcurrencyTest.java](code/lang-basics/src/test/java/study/basics/ConcurrencyTest.java) |
| 字符串与 `==` | [StringsAndEquality.java](code/lang-basics/src/main/java/study/basics/StringsAndEquality.java) | [StringsAndEqualityTest.java](code/lang-basics/src/test/java/study/basics/StringsAndEqualityTest.java) |
| 单文件脚本 | [scripts/Hello.java](code/lang-basics/scripts/Hello.java) | `java code/lang-basics/scripts/Hello.java` |

### 2. shop-api：Spring Boot 应用

默认使用 H2 内存库，零依赖启动，自动建表（Flyway）并插入演示商品：

```bash
cd code/shop-api
./mvnw spring-boot:run
```

另开一个终端：

```bash
# 公开查询
curl -s localhost:8080/api/products

# 未认证写入 → 401
curl -i -X POST localhost:8080/api/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-100","name":"显示器","price":1999.00,"stock":3}'

# HTTP Basic 认证后下单 → 201
curl -i -u customer:customer123 -X POST localhost:8080/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"ben","items":[{"productId":3,"quantity":99}]}'

# 库存不足 → 409 application/problem+json
curl -i -u customer:customer123 -X POST localhost:8080/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"ben","items":[{"productId":3,"quantity":3}]}'

# 健康检查
curl -s localhost:8080/actuator/health
```

演示账号：

| 用户 | 密码 | 角色 | 权限 |
|---|---|---|---|
| `admin` | `admin123` | ADMIN | 增删改查；`DELETE` 仅 ADMIN |
| `customer` | `customer123` | CUSTOMER | 下单、查询订单 |

主要接口：

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/products?q=键盘` | 否 | 商品列表/搜索 |
| GET | `/api/products/{id}` | 否 | 商品详情 |
| POST | `/api/products` | 是 | 创建商品 |
| PUT | `/api/products/{id}` | 是 | 修改商品 |
| DELETE | `/api/products/{id}` | ADMIN | 删除商品 |
| POST | `/api/orders` | 是 | 下单（扣库存） |
| GET | `/api/orders/{id}` | 是 | 订单详情 |
| GET | `/api/orders` | 是 | 订单列表 |
| GET | `/actuator/health` | 否 | 健康检查 |

### 3. PostgreSQL profile（可选）

```bash
cd code/shop-api
docker compose up -d
./mvnw spring-boot:run -Dspring-boot.run.profiles=postgres
```

连接参数可用环境变量覆盖：`DB_URL`、`DB_USER`、`DB_PASSWORD`（见
[application-postgres.yml](code/shop-api/src/main/resources/application-postgres.yml)）。

### 4. 测试

```bash
cd code/lang-basics && ./mvnw verify
cd code/shop-api   && ./mvnw verify
```

shop-api 的测试覆盖：

| 类型 | 测试类 |
|---|---|
| `@WebMvcTest` + 安全/校验/ProblemDetail | [ProductControllerTest.java](code/shop-api/src/test/java/study/shop/product/ProductControllerTest.java)、[OrderControllerTest.java](code/shop-api/src/test/java/study/shop/order/OrderControllerTest.java) |
| `@DataJpaTest` + 乐观锁 | [ProductRepositoryTest.java](code/shop-api/src/test/java/study/shop/product/ProductRepositoryTest.java) |
| `@SpringBootTest` + 事务回滚 | [OrderServiceTest.java](code/shop-api/src/test/java/study/shop/order/OrderServiceTest.java) |
| 自调用与代理 | [SelfInvocationTest.java](code/shop-api/src/test/java/study/shop/common/SelfInvocationTest.java) |
| 切面 / 配置 / Actuator / Basic Auth | [ShopApiApplicationTest.java](code/shop-api/src/test/java/study/shop/ShopApiApplicationTest.java) |
| JdbcClient 报表 | [CatalogReportDaoTest.java](code/shop-api/src/test/java/study/shop/order/CatalogReportDaoTest.java) |
| Testcontainers（`@Tag("testcontainers")`） | [PostgresTestcontainersTest.java](code/shop-api/src/test/java/study/shop/PostgresTestcontainersTest.java) |

Testcontainers 测试在没有 Docker 时自动跳过（`disabledWithoutDocker = true`）。

## 验证记录（2026-10-22）

实际执行过的命令与结果：

| 命令 | 结果 |
|---|---|
| `JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ./mvnw -q verify`（lang-basics） | 9 个测试类、39 个测试全部通过 |
| 同上（shop-api） | 8 个测试类、24 个测试全部通过；含 PostgreSQL Testcontainers（约 53s）和打包 fat jar |
| 启动 `java -jar target/shop-api-1.0.0-SNAPSHOT.jar` 后 curl | 见下表 |
| Markdown 相对链接检查 | 14 个文件、131 个链接，0 失效 |
| `java code/lang-basics/scripts/Hello.java` | 输出 `Hello, PHPer! 当前 Java 版本：26.0.2` |

curl 走查结果：

| 请求 | 结果 |
|---|---|
| `GET /api/products` | `200`，返回 3 个演示商品 |
| `POST /api/products`（无认证） | `401` + `WWW-Authenticate: Basic` |
| `POST /api/orders`（`customer:customer123`，库存充足） | `201`，库存 `20 → 18`，商品 `version` `0 → 1` |
| `POST /api/orders`（库存不足） | `409`，`Content-Type: application/problem+json`，含 `sku/requested/available` |
| `GET /actuator/health` | `200`，`{"status":"UP"}` |

**未验证项**：

- 开发机只有 JDK 26，工程用 `maven.compiler.release=25` 编译为 Java 25 字节码，**未在真正的 JDK 25 运行时上执行**。
- Dockerfile 未实际执行 `docker build`。
- 未手动执行 `docker compose up` + `postgres` profile（PostgreSQL 兼容性已由 Testcontainers 测试覆盖）。

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

## 学习建议

1. **先装 IntelliJ IDEA**。Java 的生产力一半来自 IDE：自动导入、重构、跳转到框架源码、调试 Spring 容器。用 VS Code 写 Java 会让你低估这门语言。
2. **读源码而不是背注解**。在 IDEA 里 `Cmd+B` 进入 `@Transactional`、`DispatcherServlet` 的实现，比读十篇博客有用。
3. **用“请求生命周期”串起所有知识**：一个 HTTP 请求从 Tomcat 线程池 → Filter 链 → DispatcherServlet → Interceptor → Controller → 代理后的 Service（事务开启）→ Repository（Hibernate Session）→ 返回 → 事务提交 → JSON 序列化。能把这条链讲清楚，就算入门了。
