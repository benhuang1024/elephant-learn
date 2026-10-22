# 07 AOP 与代理原理 —— 为什么 `@Transactional` 有时不生效

## 1. 注解本身什么都不做

`@Transactional`、`@Cacheable`、`@Async`、`@PreAuthorize`、`@Retryable` 都只是标记。真正干活的是 Spring 在启动时为 Bean 创建的 **代理对象**：

```
调用方 ──► [代理对象 OrderService$$SpringCGLIB]  ──► [真实对象 OrderService]
              │ 1. 开启事务
              │ 2. 调用真实方法 ──────────────────►  place()
              │ 3. 正常返回 → 提交；抛 RuntimeException → 回滚
```

注入到 Controller 里的 `OrderService`，其实是这个代理。

用 PHP 类比：相当于容器在 `make(OrderService::class)` 时返回了一个装饰器，每个方法调用前后包裹了 `DB::beginTransaction()` / `commit()` / `rollBack()`。（Laravel 没有内置这种机制，但 Symfony 的 lazy service 代理、Doctrine 的实体代理原理相同。）

## 2. 两种代理实现

| 方式 | 条件 | 原理 |
|---|---|---|
| JDK 动态代理 | 基于接口 | 运行时生成实现同一接口的类 |
| CGLIB（Spring Boot 默认） | 基于类 | 运行时生成 **子类**，覆盖方法 |

CGLIB 生成子类，所以：

- `final` 类、`final` 方法 **不能被代理**，注解失效；
- `private` 方法无法覆盖，注解失效；
- 这也是 JPA 实体不能是 `final`/record 的原因（Hibernate 用同样的方式生成懒加载代理）。

## 3. 经典陷阱：自调用

```java
@Service
public class OrderService {

    public void placeBatch(List<PlaceOrderRequest> reqs) {
        for (var r : reqs) {
            place(r);              // ❌ 等价于 this.place(r)：this 是真实对象，不经过代理，没有事务
        }
    }

    @Transactional
    public void place(PlaceOrderRequest r) { ... }
}
```

```
Controller ──► 代理.placeBatch()  （placeBatch 没有注解，直接转给真实对象）
                    └──► 真实对象.placeBatch()
                              └──► this.place()   ← 直接调用，代理被绕过
```

解决办法（推荐顺序）：

1. **把方法拆到另一个 Bean**（最清晰，通常也意味着职责划分更好）：

   ```java
   @Service
   class OrderBatchService {
       private final OrderService orders;            // 注入的是代理
       void placeBatch(List<PlaceOrderRequest> reqs) {
           reqs.forEach(orders::place);              // ✅ 每个订单一个独立事务
       }
   }
   ```

2. 使用编程式事务 `TransactionTemplate`：

   ```java
   reqs.forEach(r -> tx.executeWithoutResult(status -> doPlace(r)));
   ```

3. 注入自身代理（`@Lazy` 注入自己）—— 能用，但说明设计有问题，不推荐。

## 4. 失效场景清单

| 场景 | 原因 |
|---|---|
| 同类内部调用 | 绕过代理 |
| 方法是 `private` / `final` / `static` | CGLIB 无法覆盖 |
| 类不是 Spring Bean（自己 `new` 出来的） | 根本没有代理 |
| 异常在方法内被 catch | 代理看不到异常 |
| 抛出受检异常 | 默认不回滚 |
| 在新线程中执行 | 事务绑定线程（ThreadLocal） |
| `@Async` 方法被同类调用 | 同样绕过代理，变成同步执行 |
| `@Cacheable` 方法被同类调用 | 同样不走缓存 |

记住一句话：**所有基于注解的横切能力都只在“通过代理从外部调用 public 方法”时生效。**

## 5. 自定义切面

需要统一的横切逻辑时（审计、耗时统计、幂等校验），可以写自己的切面。需引入 `spring-boot-starter-aspectj`（Boot 4 中 AOP starter 的名称）。

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Audited {
    String action();
}

@Aspect
@Component
class AuditAspect {
    private static final Logger log = LoggerFactory.getLogger(AuditAspect.class);

    @Around("@annotation(audited)")
    Object around(ProceedingJoinPoint pjp, Audited audited) throws Throwable {
        long start = System.nanoTime();
        try {
            return pjp.proceed();                         // 调用真实方法
        } finally {
            log.info("audit action={} method={} cost={}ms",
                    audited.action(), pjp.getSignature().toShortString(),
                    (System.nanoTime() - start) / 1_000_000);
        }
    }
}

@Service
class RefundService {
    @Audited(action = "REFUND")
    @Transactional
    public void refund(Long orderId) { ... }
}
```

多个切面作用于同一个方法时（审计 + 事务 + 缓存），用 `@Order` 控制嵌套顺序。

## 6. 如何验证一个 Bean 是否被代理

```java
log.info("{}", orderService.getClass());
// class com.acme.shop.order.OrderService$$SpringCGLIB$$0  ← 被代理了
```

或者在 IDEA 调试时查看注入对象的类型；调用栈中出现 `TransactionInterceptor`、`CglibAopProxy` 说明经过了代理。
