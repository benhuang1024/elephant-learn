# 01 Java 语言速通（PHP 对照版）

> 配套代码：[code/lang-basics](../code/lang-basics/src/main/java/study/basics/)
> 本章假设你熟悉 PHP 8.x 的类型声明、readonly、enum、match、first-class callable。

## 1. 心智模型：Java 和“严格模式 PHP”的差距

如果你的 PHP 代码已经是 `declare(strict_types=1)` + 全量类型声明 + PHPStan max level，那你离 Java 只差这几步：

| 维度 | PHP 8 | Java 25 |
|---|---|---|
| 类型检查时机 | 运行时（PHPStan 补静态检查） | **编译期**，过不了编译就跑不起来 |
| 文件组织 | 一个文件可以多个类；PSR-4 是约定 | 一个 `public` 类一个文件，**文件名 = 类名**，包名 = 目录 |
| 命名空间 | `namespace App\Order;` + `use` | `package com.acme.order;` + `import` |
| 数组 | `array` 万能（列表 + 字典 + 栈） | 拆成 `List`、`Map`、`Set`、`Deque` 等，以及定长数组 `int[]` |
| 基本类型 | `int` / `float` / `string` / `bool` | 8 个基本类型（`int`、`long`、`double`、`boolean`…）+ 对应包装类（`Integer`…） |
| null | 类型可空 `?string` | 所有对象引用都可能是 null（编译器不检查）；用 `Optional` 和注解约束 |
| 函数 | 全局函数 + 闭包 | **没有全局函数**，一切都在类里；静态方法 + lambda |
| 魔术方法 | `__get`、`__call`… | 没有。动态性靠反射和代理（框架内部用） |
| 访问修饰 | public / protected / private | 再加一个 **包级私有**（不写修饰符时的默认值） |

## 2. 变量、类型、基本语法

```php
// PHP
$count = 10;
$price = 9.99;
$name  = 'Ben';
$tags  = ['a', 'b'];
$map   = ['apple' => 3];
```

```java
// Java
int count = 10;
double price = 9.99;              // 演示用；金额请用 BigDecimal
String name = "Ben";              // 字符串必须用双引号；'a' 是 char
var tags = List.of("a", "b");     // var：局部变量类型推断，类型仍是静态的 List<String>
var map = Map.of("apple", 3);     // Map<String, Integer>
```

要点：

- `var` 只是省略书写，不是动态类型。`var x = 1; x = "a";` 编译失败。
- `int` 是 32 位、`long` 是 64 位。数据库 `BIGINT` 主键对应 `Long`。整数溢出 **不会** 自动变成 float，会静默回绕。
- `List.of()` / `Map.of()` 返回 **不可变** 集合，`add` 会抛异常。需要可变用 `new ArrayList<>()`。
- `Map.of` 不保证顺序；需要 PHP 关联数组那样的插入顺序，用 `LinkedHashMap`。

## 3. 类、接口、构造器

```php
// PHP
final class OrderService
{
    public function __construct(
        private readonly OrderRepository $orders,
        private readonly Clock $clock,
    ) {}

    public function place(PlaceOrder $cmd): Order { ... }
}
```

```java
// Java
public final class OrderService {

    private final OrderRepository orders;
    private final Clock clock;

    public OrderService(OrderRepository orders, Clock clock) {
        this.orders = orders;
        this.clock = clock;
    }

    public Order place(PlaceOrder cmd) { ... }
}
```

- Java 没有构造器属性提升（constructor promotion），字段要单独声明。很多团队用 **Lombok** 的 `@RequiredArgsConstructor` 省掉样板代码；不想引入 Lombok 时，值对象优先用 `record`。
- `final` 字段 ≈ `readonly`：只能在构造器里赋值一次。
- 方法默认是 **可覆盖** 的（虚方法）。类上加 `final` 禁止继承。
- 没有方法默认参数 —— 用 **方法重载**（同名不同参数）或 Builder 模式。
- 没有命名参数 —— 参数多时用 record/Builder 封装。

### 接口

```java
public interface PaymentGateway {
    PaymentResult charge(Money amount);

    // 默认方法：接口里可以带实现（≈ PHP trait 的一部分能力）
    default boolean supportsRefund() {
        return false;
    }
}
```

Java 没有 trait。复用行为的手段：接口默认方法、组合（推荐）、抽象基类。

## 4. record：值对象和 DTO 的标准写法

见 [Money.java](../code/lang-basics/src/main/java/study/basics/Money.java)。

```java
public record Money(BigDecimal amount, String currency) {
    public Money {                       // 紧凑构造器：只写校验
        if (amount.signum() < 0) throw new IllegalArgumentException("金额不能为负");
    }
}

var m = new Money(new BigDecimal("9.90"), "CNY");
m.amount();                              // 访问器没有 get 前缀
m.equals(new Money(new BigDecimal("9.90"), "CNY"));  // true：按值比较
```

record 是不可变的、`final` 的，自动生成 `equals`/`hashCode`/`toString`。
**请求/响应 DTO、领域值对象、事件、命令 —— 一律优先 record。** Spring MVC 和 Jackson 都原生支持把 JSON 绑定到 record。

## 5. enum：比 PHP enum 更强

见 [OrderStatus.java](../code/lang-basics/src/main/java/study/basics/OrderStatus.java)。Java enum 可以有字段、构造器、方法，甚至每个常量覆盖方法。

| PHP | Java |
|---|---|
| `OrderStatus::from('paid')` | `OrderStatus.valueOf("PAID")`（按常量名）或自写 `fromCode` |
| `OrderStatus::cases()` | `OrderStatus.values()` |
| `$s->value` | `s.name()` / 自定义字段 |
| `match($s) {...}` | `switch (s) { case PAID -> ...; }` |

`switch` 枚举时如果覆盖了所有常量就不需要 `default`，新增常量后所有没处理的 switch 表达式 **编译报错** —— 这是重构安全性的来源。

## 6. sealed + 模式匹配：编译期穷举

见 [Shapes.java](../code/lang-basics/src/main/java/study/basics/Shapes.java)。

```java
sealed interface PaymentResult permits Success, Declined, NeedsAction {}
record Success(String txId) implements PaymentResult {}
record Declined(String reason) implements PaymentResult {}
record NeedsAction(String redirectUrl) implements PaymentResult {}

String handle(PaymentResult r) {
    return switch (r) {
        case Success(var txId)       -> "ok " + txId;
        case Declined(var reason)    -> "fail " + reason;
        case NeedsAction(var url)    -> "redirect " + url;
    };   // 没有 default；新增一种结果 → 所有 switch 编译失败，逼你处理
}
```

这在设计领域模型时非常好用：用类型表达“结果只有这几种”，而不是返回带 `status` 字段的数组。

## 7. 泛型

见 [Generics.java](../code/lang-basics/src/main/java/study/basics/Generics.java)。

PHP 里你写 `/** @return Collection<int, User> */`，Java 里直接写 `List<User>`，并由编译器强制。

```java
public interface Repository<T, ID> {
    Optional<T> findById(ID id);
    List<T> findAll();
}

public static <T, K> Map<K, T> keyBy(Collection<T> items, Function<T, K> keyFn) { ... }
```

需要知道的三件事：

1. **类型擦除**：运行时泛型信息被擦除，`List<String>` 和 `List<Integer>` 是同一个 class。所以不能 `new T()`，不能 `instanceof List<String>`。
2. **基本类型不能做泛型参数**：`List<int>` 非法，要写 `List<Integer>`（自动装箱）。
3. **通配符**：读用 `? extends T`，写用 `? super T`（PECS）。业务代码里很少写，读框架源码时常见。

## 8. null 与 Optional

见 [NullSafety.java](../code/lang-basics/src/main/java/study/basics/NullSafety.java)。

```php
$city = $repo->find($id)?->address?->city ?? '未知';
```

```java
String city = repo.findById(id)
        .map(User::address)
        .map(Address::city)
        .orElse("未知");
```

团队规范建议：

- `Optional` 只作 **返回值**；不要用作字段、方法参数、集合元素。
- 集合返回空集合（`List.of()`），永远不返回 null。
- 参数校验用 `Objects.requireNonNull(x, "x")`。
- Spring Framework 7 全面采用 **JSpecify** 的 `@Nullable` / `@NullMarked` 注解，配合 IDE 或 NullAway 可以得到接近 Kotlin 的空安全检查。

## 9. 异常：受检 vs 非受检

见 [Exceptions.java](../code/lang-basics/src/main/java/study/basics/Exceptions.java)。

| 类型 | 继承自 | 编译器要求 | 典型例子 |
|---|---|---|---|
| 受检异常 checked | `Exception` | 必须 `catch` 或 `throws` 声明 | `IOException`、`SQLException` |
| 非受检异常 unchecked | `RuntimeException` | 不强制 | `IllegalArgumentException`、`NullPointerException` |
| 错误 | `Error` | 不要捕获 | `OutOfMemoryError` |

实践规则：

- **业务异常继承 `RuntimeException`**，在 Web 层用全局异常处理器统一转成 HTTP 响应（见第 05 章）。
- Spring 把 JDBC 的 `SQLException` 转换成了非受检的 `DataAccessException` 体系，所以你在 Spring 项目里很少碰到受检异常。
- 包装异常时 **一定要传 cause**：`throw new BizException("...", e);`，否则丢失堆栈。
- `try-with-resources` 替代 `finally { close() }`。
- 默认情况下，Spring 事务 **只对 RuntimeException 和 Error 回滚**，受检异常不回滚 —— 这是一个经典坑（第 06 章）。

## 10. 集合：拆开 PHP 的 array

| PHP 用法 | Java 类型 | 实现选择 |
|---|---|---|
| `[1, 2, 3]` 列表 | `List<Integer>` | `ArrayList`（默认）、`List.of()`（不可变） |
| `['k' => 'v']` 字典 | `Map<String, String>` | `HashMap`（无序）、`LinkedHashMap`（插入序）、`TreeMap`（键排序） |
| `array_unique` 后的集合 | `Set<String>` | `HashSet`、`LinkedHashSet`、`TreeSet` |
| `array_push/array_pop` | `Deque<T>` | `ArrayDeque` |
| `SplPriorityQueue` | `PriorityQueue<T>` | — |
| 多线程共享的字典 | `Map` | **`ConcurrentHashMap`** |

最常见的坑：

- PHP 数组是 **值语义**（赋值即复制，写时复制），Java 集合是 **引用语义**：把一个 `List` 传给方法，方法内修改会影响调用方。需要防御时返回 `List.copyOf(list)`。
- `Map.get(key)` 不存在时返回 `null`，不会报 `Undefined index`。用 `getOrDefault` 或 `computeIfAbsent`。
- 遍历时修改集合会抛 `ConcurrentModificationException`，用 `removeIf` 或迭代器删除。

## 11. Lambda 与 Stream

见 [StreamsVsArrayFunctions.java](../code/lang-basics/src/main/java/study/basics/StreamsVsArrayFunctions.java)。

| PHP / Laravel Collection | Java Stream |
|---|---|
| `array_map(fn($o) => $o->id, $orders)` | `orders.stream().map(Order::id).toList()` |
| `array_filter($orders, fn($o) => $o->paid)` | `.filter(Order::paid)` |
| `array_reduce(...)` / `->sum('amount')` | `.map(Order::amount).reduce(BigDecimal.ZERO, BigDecimal::add)` |
| `->groupBy('city')` | `.collect(Collectors.groupingBy(Order::city))` |
| `->keyBy('id')` | `.collect(Collectors.toMap(Order::id, o -> o))` |
| `->sortByDesc('amount')->take(5)` | `.sorted(comparing(Order::amount).reversed()).limit(5)` |
| `->pluck('city')->unique()->implode(',')` | `.map(Order::city).distinct().collect(joining(","))` |
| `->first()` | `.findFirst()`（返回 Optional） |
| `->contains(fn...)` | `.anyMatch(...)` |

- `Order::id` 是方法引用，≈ PHP 8.1 的 first-class callable `$o->id(...)`。
- lambda 里只能引用 **事实上 final** 的局部变量（不能在 lambda 里修改外部变量，PHP 的 `use (&$x)` 写法在 Java 不存在）。
- Stream 是惰性、一次性的；不要用 Stream 写有副作用的逻辑，复杂逻辑写普通 for 循环一点都不丢人。

## 12. 字符串与相等性

见 [StringsAndEquality.java](../code/lang-basics/src/main/java/study/basics/StringsAndEquality.java)。

- **`==` 比较引用，`equals()` 比较内容。** `if (status == "paid")` 是 PHP 转 Java 第一大 bug。推荐写法：`"paid".equals(status)`（还能防 NPE）。
- 包装类同理：`Integer a = 1000, b = 1000; a == b` 是 `false`。
- 没有字符串插值，用 `"%s 共 %d 件".formatted(name, qty)`。
- 文本块 `""" ... """` ≈ heredoc（无插值）。
- 字符串是 UTF-16，`length()` 是 UTF-16 码元数，不是字节数也不完全等于字符数（emoji 占 2）。

## 13. 本章自测

用 Java 写出以下 PHP 代码的等价实现，然后对照配套代码：

```php
$paidTotalByCity = collect($orders)
    ->filter(fn($o) => $o->paid)
    ->groupBy('city')
    ->map(fn($g) => $g->sum('amount'))
    ->sortDesc();
```

<details>
<summary>参考答案</summary>

```java
Map<String, BigDecimal> result = orders.stream()
        .filter(Order::paid)
        .collect(Collectors.groupingBy(
                Order::city,
                Collectors.reducing(BigDecimal.ZERO, Order::amount, BigDecimal::add)))
        .entrySet().stream()
        .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
        .collect(Collectors.toMap(
                Map.Entry::getKey, Map.Entry::getValue,
                (a, b) -> a, LinkedHashMap::new));   // LinkedHashMap 保留排序结果
```

最后一步说明了 PHP 数组“天然有序”这个特性在 Java 里需要显式选择数据结构。
</details>
