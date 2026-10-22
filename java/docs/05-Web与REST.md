# 05 Web 与 REST

> **配套代码（shop-api）**
> Controller：[ProductController.java](../code/shop-api/src/main/java/study/shop/product/ProductController.java)、[OrderController.java](../code/shop-api/src/main/java/study/shop/order/OrderController.java)
> 请求 DTO + Bean Validation：[ProductRequest.java](../code/shop-api/src/main/java/study/shop/product/ProductRequest.java)、[PlaceOrderRequest.java](../code/shop-api/src/main/java/study/shop/order/PlaceOrderRequest.java)
> 全局异常 → ProblemDetail：[ApiExceptionHandler.java](../code/shop-api/src/main/java/study/shop/common/ApiExceptionHandler.java)
> Filter（Servlet 层）：[RequestIdFilter.java](../code/shop-api/src/main/java/study/shop/common/RequestIdFilter.java)
> Interceptor（Spring MVC 层）：[RequestTimingInterceptor.java](../code/shop-api/src/main/java/study/shop/common/RequestTimingInterceptor.java)、[WebConfig.java](../code/shop-api/src/main/java/study/shop/config/WebConfig.java)
> 接口测试：[ProductControllerTest.java](../code/shop-api/src/test/java/study/shop/product/ProductControllerTest.java)、[OrderControllerTest.java](../code/shop-api/src/test/java/study/shop/order/OrderControllerTest.java)

## 1. 概念映射

| Laravel | Spring MVC |
|---|---|
| `routes/api.php` | 没有路由文件，路由写在 Controller 注解上 |
| Controller | `@RestController` |
| `Route::get('/products/{id}')` | `@GetMapping("/products/{id}")` |
| `$request->input('q')` | `@RequestParam String q` |
| 路由参数 `{id}` | `@PathVariable Long id` |
| `$request->json()->all()` | `@RequestBody CreateProductRequest body`（自动反序列化为 record） |
| FormRequest + rules | Bean Validation 注解 + `@Valid` |
| `return response()->json($x, 201)` | 返回对象（自动转 JSON）或 `ResponseEntity` |
| API Resource | 响应 DTO（record） |
| Middleware | `Filter`（Servlet 层）或 `HandlerInterceptor`（MVC 层） |
| `app/Exceptions/Handler.php` | `@RestControllerAdvice` + `@ExceptionHandler` |
| `php artisan route:list` | Actuator `/actuator/mappings` 或 IDEA Endpoints 窗口 |
| Guzzle / Http facade | `RestClient` / HTTP Interface |

## 2. 一个完整的 CRUD Controller

```java
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService products;

    public ProductController(ProductService products) {
        this.products = products;
    }

    // GET /api/products?keyword=phone&page=0&size=20
    @GetMapping
    public Page<ProductResponse> search(@RequestParam(required = false) String keyword,
                                        Pageable pageable) {          // 自动解析 page/size/sort 参数
        return products.search(keyword, pageable).map(ProductResponse::from);
    }

    @GetMapping("/{id}")
    public ProductResponse get(@PathVariable Long id) {
        return ProductResponse.from(products.get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductResponse create(@Valid @RequestBody CreateProductRequest req) {
        return ProductResponse.from(products.create(req));
    }

    @PutMapping("/{id}")
    public ProductResponse update(@PathVariable Long id, @Valid @RequestBody UpdateProductRequest req) {
        return ProductResponse.from(products.update(id, req));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        products.delete(id);
    }
}
```

### 请求/响应 DTO：用 record，不要直接暴露实体

```java
public record CreateProductRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Pattern(regexp = "[A-Z0-9-]{3,32}") String sku,
        @NotNull @DecimalMin("0.01") BigDecimal price,
        @PositiveOrZero int stock) {
}

public record ProductResponse(Long id, String name, String sku, BigDecimal price, int stock) {
    public static ProductResponse from(Product p) {
        return new ProductResponse(p.getId(), p.getName(), p.getSku(), p.getPrice(), p.getStock());
    }
}
```

与 Laravel 对照：

```php
// FormRequest
public function rules(): array {
    return [
        'name'  => 'required|string|max:100',
        'sku'   => ['required', 'regex:/^[A-Z0-9-]{3,32}$/'],
        'price' => 'required|numeric|min:0.01',
        'stock' => 'integer|min:0',
    ];
}
```

为什么不直接返回 JPA 实体：懒加载字段会在序列化时触发额外查询甚至报错、双向关联会无限递归、内部字段泄漏、API 与表结构耦合（≈ 为什么 Laravel 要用 API Resource）。

## 3. 统一异常处理 ≈ Exceptions/Handler.php

Spring 6+ 内置了 RFC 9457 **ProblemDetail** 格式，推荐直接使用：

```java
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) { super(message); }
}

public class BusinessException extends RuntimeException {
    private final String code;
    public BusinessException(String code, String message) { super(message); this.code = code; }
    public String code() { return code; }
}

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(BusinessException.class)
    ProblemDetail business(BusinessException e) {
        var pd = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
        pd.setProperty("code", e.code());
        return pd;
    }

    // @Valid 校验失败 ≈ Laravel 的 422 ValidationException
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalid(MethodArgumentNotValidException e) {
        var pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, "参数校验失败");
        Map<String, String> errors = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors()
                .forEach(fe -> errors.put(fe.getField(), fe.getDefaultMessage()));
        pd.setProperty("errors", errors);
        return pd;
    }
}
```

响应示例：

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "库存不足 sku=PHONE-1 需要=5 剩余=2",
  "instance": "/api/orders",
  "code": "INSUFFICIENT_STOCK"
}
```

## 4. 中间件：Filter vs Interceptor

```
HTTP 请求
  → Tomcat
  → Filter 链（Servlet 规范，Spring Security 也在这一层）      ≈ 全局中间件
  → DispatcherServlet（Spring MVC 前端控制器）                 ≈ Laravel Router
  → HandlerInterceptor.preHandle（知道将调用哪个 Controller）   ≈ 路由中间件
  → 参数解析 / 校验
  → Controller 方法
  → HandlerInterceptor.postHandle / afterCompletion
  → 消息转换（对象 → JSON，Jackson）
```

Filter 示例：给每个请求生成 traceId 并写入日志上下文（第 10 章还会用到）：

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String traceId = Optional.ofNullable(req.getHeader("X-Trace-Id"))
                .orElse(UUID.randomUUID().toString());
        MDC.put("traceId", traceId);
        res.setHeader("X-Trace-Id", traceId);
        try {
            chain.doFilter(req, res);     // ≈ return $next($request);
        } finally {
            MDC.remove("traceId");        // 线程会被复用，必须清理（见第 02 章 ThreadLocal）
        }
    }
}
```

Interceptor 示例：

```java
@Component
class SlowRequestInterceptor implements HandlerInterceptor {
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        req.setAttribute("start", System.nanoTime());
        return true;                        // 返回 false 即中断请求
    }
    public void afterCompletion(HttpServletRequest req, HttpServletResponse res, Object handler, Exception ex) {
        long ms = (System.nanoTime() - (long) req.getAttribute("start")) / 1_000_000;
        if (ms > 500) log.warn("slow request {} {}ms", req.getRequestURI(), ms);
    }
}

@Configuration
class WebConfig implements WebMvcConfigurer {
    private final SlowRequestInterceptor slow;
    WebConfig(SlowRequestInterceptor slow) { this.slow = slow; }

    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(slow).addPathPatterns("/api/**");
    }
}
```

## 5. JSON：Jackson

Spring Boot 4 默认使用 **Jackson 3**（包名从 `com.fasterxml.jackson.databind` 变为 `tools.jackson.databind`，注解仍在 `com.fasterxml.jackson.annotation`）。

常用配置：

```yaml
spring:
  jackson:
    default-property-inclusion: non_null      # 不输出 null 字段
```

- 字段命名默认 camelCase。前端要 snake_case 时设置 `spring.jackson.property-naming-strategy: SNAKE_CASE`。
- 时间类型用 `java.time`：`Instant`（时间点，推荐存储和传输）、`LocalDate`（日期）、`OffsetDateTime`。默认序列化为 ISO-8601 字符串。永远不要再用 `java.util.Date`。

## 6. 调用外部 HTTP 服务

### RestClient（≈ Laravel Http facade）

```java
@Bean
RestClient githubClient(RestClient.Builder builder) {
    return builder.baseUrl("https://api.github.com")
            .defaultHeader("Accept", "application/vnd.github+json")
            .build();
}

GithubUser user = githubClient.get()
        .uri("/users/{name}", name)
        .retrieve()
        .body(GithubUser.class);           // JSON 直接映射到 record
```

### HTTP Interface（声明式客户端，类似 Retrofit / Feign）

```java
@HttpExchange("/users")
public interface GithubApi {
    @GetExchange("/{name}")
    GithubUser getUser(@PathVariable String name);
}
```

Spring Framework 7 可以用 `@ImportHttpServices` 批量注册这类接口为 Bean，直接注入使用。

生产要点：一定要设置连接/读取超时；重试只用于幂等请求。Spring Framework 7 在核心中内置了 `@Retryable` 和 `@ConcurrencyLimit`（需 `@EnableResilientMethods` 开启），简单场景无需再引入 Resilience4j。

## 7. API 版本

Spring Framework 7 原生支持 API 版本控制：

```java
@GetMapping(path = "/products/{id}", version = "1")
ProductV1 getV1(@PathVariable Long id) { ... }

@GetMapping(path = "/products/{id}", version = "2")
ProductV2 getV2(@PathVariable Long id) { ... }
```

版本从请求头、查询参数、路径或媒体类型中解析，通过 `spring.mvc.apiversion.*` 配置或 `WebMvcConfigurer#configureApiVersioning` 设置。
