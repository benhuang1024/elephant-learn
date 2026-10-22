# 03 Maven 与项目结构

> 示例：[lang-basics/pom.xml](../code/lang-basics/pom.xml)

## 1. composer.json ↔ pom.xml

```json
{
  "name": "acme/shop",
  "require": {
    "php": "^8.3",
    "laravel/framework": "^11.0",
    "guzzlehttp/guzzle": "^7.8"
  },
  "require-dev": {
    "phpunit/phpunit": "^11.0"
  }
}
```

```xml
<project>
    <modelVersion>4.0.0</modelVersion>

    <!-- 继承 Spring Boot 的父 POM：统一管理几百个依赖的版本 + 插件配置 -->
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>4.1.1</version>
    </parent>

    <groupId>com.acme</groupId>          <!-- ≈ vendor -->
    <artifactId>shop</artifactId>        <!-- ≈ package -->
    <version>1.0.0-SNAPSHOT</version>

    <properties>
        <java.version>25</java.version>  <!-- ≈ "php": "^8.3" -->
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webmvc</artifactId>
            <!-- 没写 version：由 parent 管理 -->
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>          <!-- ≈ require-dev -->
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- 把应用打成可执行 fat jar -->
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

## 2. 关键差异

| 维度 | Composer | Maven |
|---|---|---|
| 版本约束 | 范围 `^7.8` + `composer.lock` | **精确版本**，无 lock 文件；可复现性靠精确版本 + BOM |
| 依赖冲突 | SAT 求解器，冲突直接报错 | **最近优先**（依赖树中路径最短的版本胜出），不报错 —— 可能静默选到旧版本 |
| 版本对齐 | 无 | **BOM**（`<dependencyManagement>` + `import`）统一一组库的版本 |
| 依赖范围 | require / require-dev | `compile`（默认）、`provided`、`runtime`、`test` |
| 本地缓存 | `~/.composer/cache` + `vendor/` | 全局 `~/.m2/repository`，**项目内没有 vendor 目录** |
| 脚本 | `scripts` | 插件 + 生命周期阶段 |
| 自动加载 | PSR-4 autoload | classpath（Maven 自动管理） |

### 依赖范围 scope

| scope | 编译时可用 | 测试时可用 | 打包进产物 | 例子 |
|---|---|---|---|---|
| `compile` | ✅ | ✅ | ✅ | Spring、Jackson |
| `runtime` | ❌ | ✅ | ✅ | JDBC 驱动（代码只依赖 JDBC 接口） |
| `provided` | ✅ | ✅ | ❌ | Lombok、外部容器提供的 Servlet API |
| `test` | ❌ | ✅ | ❌ | JUnit、Mockito、Testcontainers |

## 3. 生命周期：一条命令跑完所有前置步骤

Maven 的阶段是有序的，执行某个阶段会先执行它之前的所有阶段：

```
validate → compile → test → package → verify → install → deploy
```

| 命令 | 做了什么 |
|---|---|
| `./mvnw compile` | 编译 |
| `./mvnw test` | 编译 + 跑单元测试 |
| `./mvnw package` | 上面全部 + 打 jar（`-DskipTests` 跳过测试） |
| `./mvnw verify` | 上面全部 + 集成测试（CI 中最常用） |
| `./mvnw install` | 安装到本地 `~/.m2`，供本机其他项目依赖 |
| `./mvnw dependency:tree` | 打印依赖树 —— 排查冲突必备 |
| `./mvnw spring-boot:run` | 启动应用 |

## 4. 依赖冲突排查

场景：A 依赖 `jackson 2.15`，B 依赖 `jackson 2.17`，Maven 按“路径最近、先声明优先”选一个，运行时可能报 `NoSuchMethodError`。

```bash
./mvnw dependency:tree -Dincludes=com.fasterxml.jackson.core
```

解决手段（优先级从高到低）：

1. 用 BOM 统一版本（Spring Boot parent 已经帮你管了绝大多数常见库 —— **不要随意覆盖 Boot 管理的版本**）。
2. 在 `<dependencyManagement>` 中钉死版本。
3. 用 `<exclusions>` 排除某个传递依赖。

## 5. 多模块项目

大型项目常拆成多模块（≈ monorepo 里的多个 composer 包，用 path repository 互相引用）：

```
shop/
├── pom.xml                 # <packaging>pom</packaging> + <modules>
├── shop-domain/pom.xml     # 纯领域模型，无框架依赖
├── shop-infra/pom.xml      # 依赖 domain，实现持久化
└── shop-app/pom.xml        # 依赖 domain + infra，Spring Boot 启动模块
```

模块间依赖是 **编译期强制的**：`shop-domain` 不依赖 Spring，就不可能在领域层误用 `@Autowired`。这是 Java 生态做分层架构比 PHP 更容易“守住边界”的原因之一。不想拆模块也可以用 Spring Modulith 在单模块内检查边界（第 11 章）。

## 6. 标准目录结构与包命名

```
src/main/java/study/shop/
├── ShopApiApplication.java     # 启动类，必须在根包，Spring 会扫描它所在包及子包
├── order/                      # 推荐“按业务特性分包”，而不是 controllers/ services/ models/
│   ├── OrderController.java
│   ├── OrderService.java
│   ├── OrderRepository.java
│   ├── Order.java
│   └── OrderItem.java
├── product/
│   ├── ProductController.java
│   ├── ProductService.java
│   ├── ProductRepository.java
│   └── Product.java
├── common/                     # 全局异常、ProblemDetail、Filter、自调用演示
├── config/                     # @ConfigurationProperties、WebMvcConfigurer、演示数据
└── security/
src/main/resources/
├── application.yml
├── application-postgres.yml
└── db/migration/V1__init.sql
src/test/java/study/shop/...    # 测试与被测类同包，可以访问包级私有成员
```

实际工程见 [code/shop-api](../code/shop-api/)，POM 见 [shop-api/pom.xml](../code/shop-api/pom.xml)。

包名约定：反转域名 + 项目 + 模块，全小写，如 `com.acme.shop.order`。

## 7. Gradle 一句话

Gradle 用 Kotlin/Groovy 脚本代替 XML，增量构建更快，Android 和部分新项目在用。概念（依赖、scope、插件、BOM）与 Maven 一一对应，学会 Maven 后迁移成本很低。
