# 04 Spring 核心：IoC 容器与配置

> **配套代码（shop-api）**
> 启动类与组件扫描：[ShopApiApplication.java](../code/shop-api/src/main/java/study/shop/ShopApiApplication.java)
> 构造器注入 + 无状态单例：[ProductService.java](../code/shop-api/src/main/java/study/shop/product/ProductService.java)、[OrderService.java](../code/shop-api/src/main/java/study/shop/order/OrderService.java)
> 类型安全配置：[ShopProperties.java](../code/shop-api/src/main/java/study/shop/config/ShopProperties.java)、[application.yml](../code/shop-api/src/main/resources/application.yml)
> Profile 覆盖：[application-postgres.yml](../code/shop-api/src/main/resources/application-postgres.yml)、[application-test.yml](../code/shop-api/src/test/resources/application-test.yml)
> `@Configuration` / 条件装配：[SecurityConfig.java](../code/shop-api/src/main/java/study/shop/security/SecurityConfig.java)、[DemoDataSeeder.java](../code/shop-api/src/main/java/study/shop/config/DemoDataSeeder.java)
> 单例状态陷阱的反面教材：[Concurrency.java](../code/lang-basics/src/main/java/study/basics/Concurrency.java)

## 1. 你已经会了 90%：Laravel Service Container ↔ Spring ApplicationContext

| Laravel | Spring | 说明 |
|---|---|---|
| Service Container | `ApplicationContext`（IoC 容器） | 管理对象的创建与依赖 |
| 绑定 `$this->app->singleton(...)` | `@Bean` 方法 / `@Component` 类 | 注册一个“Bean” |
| 自动解析（反射构造器） | 构造器注入（同样基于类型） | |
| Service Provider `register()` | `@Configuration` 类 | 集中声明 Bean |
| `bind(Interface::class, Impl::class)` | 接口只有一个实现时自动绑定；多个时用 `@Primary` / `@Qualifier` | |
| Contextual binding `when()->needs()` | `@Qualifier("xxx")` | |
| `$this->app->tag()` + `tagged()` | 注入 `List<Interface>` / `Map<String, Interface>` | 拿到所有实现 |
| Package auto-discovery | **Auto-configuration**（Spring Boot 的核心） | 加入依赖即自动配置 |
| `config/*.php` + `.env` | `application.yml` + 环境变量 | |
| `APP_ENV` | Spring Profiles | |
| Facade | 无（Spring 不鼓励静态访问） | |

最大区别：**Laravel 默认每次 `make` 都 new 一个新实例（bind），Spring 默认单例（singleton）**，并且是常驻进程中的单例（第 02 章）。

## 2. 声明 Bean 的两种方式

### 方式一：组件扫描（最常用）

```java
@Service                                   // 也可以是 @Component / @Repository / @Controller，语义不同、效果相同
public class OrderService {

    private final OrderRepository orders;
    private final PaymentGateway payment;

    // 只有一个构造器时不需要 @Autowired，Spring 自动按类型注入
    public OrderService(OrderRepository orders, PaymentGateway payment) {
        this.orders = orders;
        this.payment = payment;
    }
}
```

启动类上的 `@SpringBootApplication` 包含 `@ComponentScan`，会扫描 **启动类所在包及其子包** 下所有带这些注解的类。类放在扫描范围外就不会被注册 —— 新手常见问题。

### 方式二：`@Configuration` + `@Bean`（≈ Service Provider）

用于第三方类（你不能在它上面加注解）或需要复杂构造逻辑时：

```java
@Configuration
public class InfraConfig {

    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }

    @Bean
    public RestClient paymentClient(RestClient.Builder builder, PaymentProperties props) {
        return builder.baseUrl(props.baseUrl()).build();
    }
}
```

## 3. 注入方式：只用构造器注入

```java
@Autowired private OrderRepository orders;       // ❌ 字段注入：不能 final、难测试、隐藏依赖
public OrderService(OrderRepository orders) {}    // ✅ 构造器注入
```

构造器注入的好处和 PHP 里一样：依赖显式、字段可 `final`、单测时直接 `new OrderService(mockRepo)`，不需要启动容器。

## 4. 一个接口多个实现

```java
public interface PaymentGateway { PaymentResult charge(Money amount); }

@Component("alipay") class AlipayGateway implements PaymentGateway { ... }
@Component("wechat") @Primary class WechatGateway implements PaymentGateway { ... }

// 默认注入 @Primary 的那个
public CheckoutService(PaymentGateway gateway) { ... }

// 指定某一个
public RefundService(@Qualifier("alipay") PaymentGateway gateway) { ... }

// 策略模式：拿到所有实现，key 是 Bean 名
public PaymentRouter(Map<String, PaymentGateway> gateways) {
    this.gateways = gateways;      // {"alipay": AlipayGateway, "wechat": WechatGateway}
}
```

最后一种写法在 PHP 里要手写注册表或用 tagged services，在 Spring 里是零配置的。

## 5. Bean 作用域

| 作用域 | 生命周期 | 何时使用 |
|---|---|---|
| `singleton`（默认） | 整个应用一个实例 | 无状态的 Service、Repository、Client —— 99% 的情况 |
| `prototype` | 每次注入/获取 new 一个 | 有状态的、短命的对象（少用） |
| `request` | 每个 HTTP 请求一个 | 请求级上下文（少用，通常用方法参数传递即可） |
| `session` | 每个 HTTP Session 一个 | 很少用 |

**设计原则：Bean 应该是无状态的**。所有状态放在方法参数、返回值、数据库或缓存中。

## 6. Bean 的生命周期与扩展点

```
实例化（构造器）→ 注入依赖 → @PostConstruct → 【使用中】 → @PreDestroy → 销毁
```

```java
@Component
class WarmUpCache {
    @PostConstruct
    void init() { /* 启动时预热缓存 —— 只执行一次，因为进程常驻 */ }
}

@Component
class OnStartup implements ApplicationRunner {
    public void run(ApplicationArguments args) { /* 容器完全启动后执行 */ }
}
```

**容器启动时会实例化所有单例 Bean**，所以配置错误、依赖缺失、循环依赖会在启动阶段直接失败（快速失败），而不是等到某个请求访问时才报错 —— 这和 Laravel 的延迟解析很不一样，对生产稳定性是好事。

Spring 默认禁止构造器循环依赖，遇到 `BeanCurrentlyInCreationException` 时应该重新设计（通常是职责划分有问题），而不是绕过。

## 7. 配置：application.yml 与类型安全的配置绑定

```yaml
# src/main/resources/application.yml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/shop
    username: shop
    password: ${DB_PASSWORD}           # 读取环境变量，≈ env('DB_PASSWORD')

shop:
  payment:
    base-url: https://pay.example.com
    timeout: 3s                        # 自动转换为 Duration
    retry: 3
```

不要到处写 `@Value("${shop.payment.base-url}")`，用 **`@ConfigurationProperties` + record** 绑定成强类型对象：

```java
@ConfigurationProperties(prefix = "shop.payment")
@Validated
public record PaymentProperties(
        @NotBlank String baseUrl,
        Duration timeout,
        @Min(0) int retry) {
}

@SpringBootApplication
@ConfigurationPropertiesScan            // 扫描所有 @ConfigurationProperties
public class ShopApiApplication { ... }
```

配置缺失或类型错误会在 **启动时** 报错，而不是运行到 `config('shop.payment.timeout')` 才发现是 null。

### 配置优先级（高 → 低，常用部分）

1. 命令行参数 `--server.port=9090`
2. 环境变量 `SERVER_PORT=9090`（点和横线转下划线、大写）
3. `application-{profile}.yml`
4. `application.yml`

这意味着同一个 jar 可以在任何环境运行，所有差异通过环境变量注入 —— 天然符合 12-Factor，和 `.env` 的思路一致，但不需要 `.env` 文件。

## 8. Profile ≈ APP_ENV

```yaml
# application.yml 写公共配置
# application-dev.yml   写开发环境覆盖
# application-prod.yml  写生产环境覆盖
```

```bash
SPRING_PROFILES_ACTIVE=prod java -jar shop.jar
```

也可以让 Bean 只在特定环境生效：

```java
@Bean
@Profile("dev")
PaymentGateway fakeGateway() { return new FakeGateway(); }
```

## 9. Auto-configuration：Spring Boot 的“魔法”

加入 `spring-boot-starter-data-jpa` 和 PostgreSQL 驱动后，你什么都没写，就有了 `DataSource`、连接池、`EntityManagerFactory`、事务管理器。原理：

- 每个 starter 带有若干 `@AutoConfiguration` 类；
- 它们用 `@ConditionalOnClass`（classpath 上有某个类）、`@ConditionalOnMissingBean`（你没有自己定义）等条件决定是否生效；
- **你自己定义了同类型的 Bean，自动配置就让位** —— 这是覆盖默认行为的标准方式。

排查“到底哪些自动配置生效了”：

```bash
./mvnw spring-boot:run -Dspring-boot.run.arguments=--debug
```

启动日志会打印 Conditions Evaluation Report。

> Spring Boot 4 把原来一个巨大的 `spring-boot-autoconfigure` 拆成了按技术划分的小模块（`spring-boot-webmvc`、`spring-boot-data-jpa`……），starter 名称也随之调整，例如 Web MVC 推荐使用 `spring-boot-starter-webmvc`。从 Boot 3 升级时注意查看官方迁移指南。

## 10. 本章自测

1. 定义一个 `NotificationSender` 接口，有 `SmsSender`、`EmailSender` 两个实现。写一个 `NotificationService`，根据用户偏好（字符串 `"sms"` / `"email"`）选择发送器，不写 if/else。
2. 把 `shop.order.max-items: 50` 配置绑定成强类型对象，值小于 1 时启动失败。

<details>
<summary>参考答案</summary>

```java
@Component("sms")   class SmsSender implements NotificationSender { ... }
@Component("email") class EmailSender implements NotificationSender { ... }

@Service
class NotificationService {
    private final Map<String, NotificationSender> senders;
    NotificationService(Map<String, NotificationSender> senders) { this.senders = senders; }

    void notify(User user, String msg) {
        var sender = senders.get(user.preferredChannel());
        if (sender == null) throw new IllegalArgumentException("unsupported channel");
        sender.send(user, msg);
    }
}

@ConfigurationProperties("shop.order")
@Validated
record OrderProperties(@Min(1) int maxItems) {}
```
</details>
