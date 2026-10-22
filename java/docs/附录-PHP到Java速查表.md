# 附录：PHP → Java 速查表

## 语法

| PHP | Java |
|---|---|
| `$x = 1;` | `int x = 1;` / `var x = 1;` |
| `const MAX = 10;` | `static final int MAX = 10;` |
| `"Hi $name"` | `"Hi " + name` / `"Hi %s".formatted(name)` |
| `<<<EOT ... EOT;` | `""" ... """` |
| `$a . $b` | `a + b` |
| `$a === $b`（字符串） | `a.equals(b)` |
| `$a === $b`（对象同一实例） | `a == b` |
| `$x ?? 'default'` | `Objects.requireNonNullElse(x, "default")` / `Optional.ofNullable(x).orElse(...)` |
| `$u?->address?->city` | `Optional.ofNullable(u).map(User::address).map(Address::city)` |
| `match($x) { 1, 2 => 'a', default => 'b' }` | `switch (x) { case 1, 2 -> "a"; default -> "b"; }` |
| `$x instanceof Foo` | `x instanceof Foo f`（同时完成类型转换） |
| `fn($x) => $x * 2` | `x -> x * 2` |
| `function () use ($y) {...}` | lambda 直接引用外部（事实上 final 的）变量 |
| `strlen(...)`（first-class callable） | `String::length`（方法引用） |
| `foreach ($list as $i => $v)` | `for (int i = 0; i < list.size(); i++)` / `for (var v : list)` |
| `foreach ($map as $k => $v)` | `map.forEach((k, v) -> ...)` / `for (var e : map.entrySet())` |
| `list($a, $b) = $arr` | record 解构：`if (p instanceof Point(var a, var b))` |
| `...$args`（变长参数） | `String... args` |
| `static::create()` | 没有后期静态绑定；用静态工厂方法 |
| `__toString()` | `toString()` |
| `__invoke()` | 实现函数式接口（`Function`、`Supplier`…） |
| `try {} catch (A\|B $e) {} finally {}` | `try {} catch (A \| B e) {} finally {}` |
| `throw new X()` 作为表达式 | `orElseThrow(() -> new X())` |
| `declare(strict_types=1)` | 默认就是 |
| `namespace App\Order;` | `package com.acme.order;` |
| `use App\Models\User;` | `import com.acme.user.User;` |
| `trait` | 接口默认方法 / 组合 |
| `abstract class` | `abstract class` |
| `final readonly class` | `record` |
| `enum Status: string` | `enum Status { ... }`（可带字段） |
| `#[Attribute]` | `@Annotation` |
| `int\|string` 联合类型 | sealed 接口 / 重载 |
| `mixed` | `Object`（尽量避免） |
| `?Foo` | `Foo`（可能为 null）+ `@Nullable` |
| `void` / `never` | `void` / 抛异常 |
| `exit()` / `die()` | 不要用；Web 中抛异常 |

## 常用函数

| PHP | Java |
|---|---|
| `count($arr)` | `list.size()` / `map.size()` / `array.length` |
| `empty($arr)` | `list.isEmpty()` |
| `in_array($x, $arr)` | `list.contains(x)` |
| `array_key_exists($k, $m)` | `map.containsKey(k)` |
| `$m[$k] ?? $d` | `map.getOrDefault(k, d)` |
| `array_keys` / `array_values` | `map.keySet()` / `map.values()` |
| `array_map` / `array_filter` / `array_reduce` | `stream().map` / `.filter` / `.reduce` |
| `array_merge($a, $b)`（列表） | `Stream.concat(a.stream(), b.stream()).toList()` / `addAll` |
| `array_slice($a, 2, 3)` | `list.subList(2, 5)` |
| `array_unique` | `stream().distinct()` / `new LinkedHashSet<>(list)` |
| `sort` / `usort` | `list.sort(Comparator.comparing(...))` |
| `array_column($rows, 'name')` | `rows.stream().map(Row::name).toList()` |
| `array_combine` / `array_flip` | `Collectors.toMap(...)` |
| `range(1, 10)` | `IntStream.rangeClosed(1, 10)` |
| `implode(',', $a)` / `explode(',', $s)` | `String.join(",", a)` / `s.split(",")` |
| `trim` / `strtolower` / `str_replace` | `strip()` / `toLowerCase()` / `replace()` |
| `str_contains` / `str_starts_with` | `contains()` / `startsWith()` |
| `substr($s, 0, 5)` | `s.substring(0, 5)` |
| `sprintf` | `String.format` / `formatted` |
| `preg_match` | `Pattern.compile(re).matcher(s).find()` |
| `intval` / `(string)` | `Integer.parseInt(s)` / `String.valueOf(x)` |
| `json_encode` / `json_decode` | Jackson `JsonMapper`（Spring 中自动处理） |
| `time()` / `date('Y-m-d')` | `Instant.now()` / `LocalDate.now().toString()` |
| Carbon | `java.time`：`Instant`、`LocalDate`、`ZonedDateTime`、`Duration` |
| `uniqid()` / `Str::uuid()` | `UUID.randomUUID()` |
| `random_int(1, 10)` | `ThreadLocalRandom.current().nextInt(1, 11)` |
| `password_hash` | Spring Security `PasswordEncoder` |
| `file_get_contents` | `Files.readString(Path.of(...))` |
| `sleep(1)` | `Thread.sleep(Duration.ofSeconds(1))` |
| `var_dump` / `dd()` | IDE 断点调试 / `log.debug` |

## 框架概念

| Laravel | Spring Boot |
|---|---|
| `artisan serve` | `./mvnw spring-boot:run` |
| `routes/api.php` + Controller | `@RestController` + `@GetMapping` |
| FormRequest | record + Bean Validation + `@Valid` |
| API Resource | 响应 DTO record |
| Middleware | `Filter` / `HandlerInterceptor` |
| Service Container / Provider | `ApplicationContext` / `@Configuration` + `@Bean` |
| Facade | 构造器注入 |
| `config()` + `.env` | `application.yml` + 环境变量 + `@ConfigurationProperties` |
| `APP_ENV` | `spring.profiles.active` |
| Eloquent Model | JPA `@Entity` |
| `Model::where()->get()` | Spring Data 方法名查询 / `@Query` |
| `with('items')` | `@EntityGraph` / `join fetch` |
| Migrations | Flyway |
| Seeder / Factory | Flyway 测试数据脚本 / 测试代码中的 Builder |
| `DB::transaction()` | `@Transactional` / `TransactionTemplate` |
| `lockForUpdate()` | `@Lock(PESSIMISTIC_WRITE)` |
| `Cache::remember` | `@Cacheable` |
| Event / Listener | `ApplicationEventPublisher` / `@EventListener` |
| Queue Job | `@Async`（进程内）/ Kafka、RabbitMQ 消费者 |
| Scheduler | `@Scheduled` |
| Auth / Sanctum | Spring Security / OAuth2 Resource Server |
| Gate / Policy | `@PreAuthorize` |
| `Http::get()` | `RestClient` / `@HttpExchange` |
| `Log::info()` | SLF4J `log.info()` |
| Telescope / Horizon 仪表盘 | Actuator + Prometheus + Grafana |
| PHPUnit Feature Test | `@WebMvcTest` / `@SpringBootTest` |
| `RefreshDatabase` | `@DataJpaTest`（自动回滚）+ Testcontainers |

## 常见坑 Top 15

1. 用 `==` 比较字符串或 `Integer`。
2. 在单例 Bean 的字段里保存请求相关数据。
3. 同类内部调用 `@Transactional` / `@Async` / `@Cacheable` 方法，注解不生效。
4. 事务中抛出受检异常，以为会回滚。
5. catch 住异常后不重新抛出，事务照常提交。
6. `@ManyToOne` 默认 EAGER，造成意外的关联查询。
7. 开着 `open-in-view`，懒加载在序列化时触发 N+1 并长时间占用连接。
8. 直接把 JPA 实体作为 JSON 返回。
9. 用 `double` 处理金额。
10. `Map.of` / `List.of` 返回不可变集合，后续 `add` 抛 `UnsupportedOperationException`。
11. 以为 `HashMap` 保持插入顺序（PHP 数组习惯），需要时用 `LinkedHashMap`。
12. ThreadLocal / MDC 用完不清理，线程复用导致数据串到下一个请求。
13. 在事务中调用慢速外部 HTTP 接口，耗尽连接池。
14. `static` 集合当缓存，无上限、无过期，最终 OOM。
15. 多实例部署时 `@Scheduled` 任务在每个实例上都执行。

## 配套代码索引

| 想查什么 | 去哪里 |
|---|---|
| record / enum / sealed / 泛型 / Optional / Stream / 异常 / 字符串 | [lang-basics](../code/lang-basics/src/main/java/study/basics/) |
| 并发竞态、Atomic、虚拟线程、并发容器 | [Concurrency.java](../code/lang-basics/src/main/java/study/basics/Concurrency.java) |
| Bean、配置绑定、Profile、条件装配 | [shop-api/config](../code/shop-api/src/main/java/study/shop/config/)、[application.yml](../code/shop-api/src/main/resources/application.yml) |
| Controller、DTO 校验、ProblemDetail、Filter/Interceptor | [product/ProductController.java](../code/shop-api/src/main/java/study/shop/product/ProductController.java)、[common/ApiExceptionHandler.java](../code/shop-api/src/main/java/study/shop/common/ApiExceptionHandler.java) |
| JPA 实体、Repository、Flyway、事务、乐观锁 | [order/](../code/shop-api/src/main/java/study/shop/order/)、[db/migration/V1__init.sql](../code/shop-api/src/main/resources/db/migration/V1__init.sql) |
| 自调用失效、CGLIB、自定义切面 | [common/SelfInvocationService.java](../code/shop-api/src/main/java/study/shop/common/SelfInvocationService.java)、[aop/ExecutionTimeAspect.java](../code/shop-api/src/main/java/study/shop/aop/ExecutionTimeAspect.java) |
| 测试：单元 / 切片 / 集成 / Testcontainers | [shop-api/src/test](../code/shop-api/src/test/java/study/shop/) |
| Security 过滤器链、HTTP Basic、方法鉴权 | [security/SecurityConfig.java](../code/shop-api/src/main/java/study/shop/security/SecurityConfig.java) |
| Actuator、Docker、PostgreSQL compose | [application.yml](../code/shop-api/src/main/resources/application.yml)、[Dockerfile](../code/shop-api/Dockerfile)、[compose.yaml](../code/shop-api/compose.yaml) |
