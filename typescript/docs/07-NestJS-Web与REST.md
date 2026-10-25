# 07 NestJS Web 与 REST

> **配套代码（shop-api）**
> 全链路：[main.ts](../code/shop-api/src/main.ts)、[app.module.ts](../code/shop-api/src/app.module.ts)、[request-id.middleware.ts](../code/shop-api/src/common/request-id.middleware.ts)、[basic-auth.guard.ts](../code/shop-api/src/auth/basic-auth.guard.ts)、[timing.interceptor.ts](../code/shop-api/src/common/timing.interceptor.ts)、[zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts)、[problem.filter.ts](../code/shop-api/src/common/problem.filter.ts)
> Controller：[product.controller.ts](../code/shop-api/src/product/product.controller.ts)、[order.controller.ts](../code/shop-api/src/order/order.controller.ts)、[actuator.controller.ts](../code/shop-api/src/health/actuator.controller.ts)
> 契约与错误：[shared/product.ts](../code/packages/shared/src/product.ts)、[shared/order.ts](../code/packages/shared/src/order.ts)、[shared/problem.ts](../code/packages/shared/src/problem.ts)、[shared/field-errors.ts](../code/packages/shared/src/field-errors.ts)、[shared/decimal.ts](../code/packages/shared/src/decimal.ts)、[domain-errors.ts](../code/shop-api/src/common/domain-errors.ts)、[timed.decorator.ts](../code/shop-api/src/common/timed.decorator.ts)、[roles.decorator.ts](../code/shop-api/src/auth/roles.decorator.ts)
> 契约测试：[shop-api.e2e.spec.ts](../code/shop-api/test/shop-api.e2e.spec.ts)、[schemas.test.ts](../code/packages/shared/test/schemas.test.ts)

## 1. 概念映射

| Laravel | Spring MVC | NestJS（本仓库） |
|---|---|---|
| `routes/api.php` | 注解在 Controller 上 | `@Controller("api/products")` + `@Get()`（模块的 `controllers` 数组即注册，不必写 `@Injectable`） |
| `$request->route('id')` | `@PathVariable Long id` | `@Param("id", new ZodValidationPipe(IdParamSchema)) id: number` |
| `$request->query('q')` | `@RequestParam(required=false) String q` | `@Query(new ZodValidationPipe(ProductQuerySchema)) query: ProductQuery` |
| `$request->json()->all()` | `@RequestBody @Valid XxxRequest` | `@Body(new ZodValidationPipe(Schema)) input` |
| FormRequest `rules()` | Bean Validation 注解 | Zod schema，放在 `@shop/shared`，前端共用 |
| `response()->json($x, 201)->header('Location', …)` | `ResponseEntity.created(uri).body(x)` | `@HttpCode(201)` + `@Res({ passthrough: true })` 设 `location()` |
| API Resource | 响应 DTO（record） | wire 函数 `toProductWire()` / `toOrderWire()` |
| Middleware / Gate | `Filter` + `HandlerInterceptor` / `@PreAuthorize` | Express 中间件 + 全局 `APP_GUARD` + `@Roles("ADMIN")` |
| `Handler::render()` / `route:list` | `@RestControllerAdvice` / `/actuator/mappings` | `@Catch()` + `APP_FILTER`；路由表看启动日志的 `RoutesResolver` 输出 |

## 2. 一个请求走完这条链

```
HTTP → Node http server → Express 5（@nestjs/platform-express）
  ①  app.use(requestIdMiddleware)                 ← Express 层，最先
  ②  Nest Middleware（本仓库没用类形式；需要 DI 时才用 NestMiddleware 类）
  ③  APP_GUARD    BasicAuthGuard.canActivate()     ← 401/403 在这里短路
  ④  APP_INTERCEPTOR RequestTimingInterceptor      ← next.handle() 之前 = preHandle
  ⑤  Pipe         ZodValidationPipe.transform()    ← 逐参数执行
  ⑥  Controller → ⑦ Service → Repository → DTO
  ⑧  Interceptor 的 finalize()                     ← afterCompletion
  ⑨  response.json(body)（没有 MessageConverter 协商）
  ✗  任何一步抛异常 → APP_FILTER ProblemDetailsFilter（挂在路由之后）
```

绑定全在 [app.module.ts](../code/shop-api/src/app.module.ts) 的 `providers` 里：`{ provide: APP_GUARD, useClass: BasicAuthGuard }`、`{ provide: APP_INTERCEPTOR, useClass: RequestTimingInterceptor }`、`{ provide: APP_FILTER, useClass: ProblemDetailsFilter }`（token 机制见 [docs/06](./06-NestJS核心-模块与DI.md)）。

| 环节 | 本仓库实现 | Spring 对应 | 关键差异与坑 |
|---|---|---|---|
| ① | [request-id.middleware.ts](../code/shop-api/src/common/request-id.middleware.ts)（普通函数） | `OncePerRequestFilter` | 不用 `NestMiddleware` 类因为它不需要 DI；代价是类型上没有 `requestId` 字段，读的地方要断言 |
| ③ | [basic-auth.guard.ts](../code/shop-api/src/auth/basic-auth.guard.ts) | `BasicAuthenticationFilter` + `AuthorizeHttpRequests` | 守卫能拿到 `ExecutionContext`，知道命中哪个 handler（`Filter` 做不到） |
| ④⑧ | [timing.interceptor.ts](../code/shop-api/src/common/timing.interceptor.ts) | `HandlerInterceptor` | 前后两段写在一个方法里，用 rxjs 操作符分隔 |
| ⑤ | [zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts) | `@Valid` + `MethodArgumentNotValidException` | 管道是**逐参数手动挂**的，不是类级注解 |
| ✗ | [problem.filter.ts](../code/shop-api/src/common/problem.filter.ts) | `@RestControllerAdvice` | 一个 `catch()` 里手写 `instanceof` 顺序，没有 `@ExceptionHandler(X.class)` 的类型分派 |

**顺序自动对齐的结果**（实测）：守卫在拦截器之前，所以 401/403 **不带 `X-Elapsed-Ms`**；而拦截器属于路由层，所以 Pipe 抛的 400、Service 抛的 404 **是带**的；没命中任何路由的 404 又不带——中间件跑了，拦截器没跑。

```
HTTP/1.1 401   X-Request-Id: ee9c…  WWW-Authenticate: Basic realm="Realm"   ← 无 X-Elapsed-Ms
HTTP/1.1 400   X-Request-Id: a659…  X-Elapsed-Ms: 0   application/problem+json
HTTP/1.1 404   X-Request-Id: ff1a…                    /api/nope：无 X-Elapsed-Ms
```

这与 Java 版「Security 链在 DispatcherServlet 之前就短路」一致，并多送一条规律：**没有 handler 就没有 interceptor**（Spring 同理）。

## 3. Express 适配层：Nest 的 `DispatcherServlet` 在哪

`NestFactory.create(AppModule)` 默认拿到 `ExpressAdapter`（`@nestjs/platform-express@12.2.0`，底层 Express 5）。分工对照：

| Spring MVC | Nest + Express |
|---|---|
| `DispatcherServlet` | Express 5 的 router（内部 `router@2.2.0` + `path-to-regexp`）+ Nest 组装的 handler 链 |
| `RequestMappingHandlerMapping` | `RoutesResolver` / `RouterExplorer` 读 `@Controller/@Get` 元数据逐条注册 |
| `HandlerAdapter` | `NestHandler` + `ExecutionContext` |
| `HandlerMethodArgumentResolver` | 参数装饰器 + Pipes |
| `MappingJackson2HttpMessageConverter` | `ExpressAdapter.reply()` 里一句 `response.json(body)`，**没有转换器协商、没有 `produces`** |
| `ExceptionHandlerExceptionResolver` | `setErrorHandler()` 挂的 `APP_FILTER` |
| `NoHandlerFoundException` → `/error` | `setNotFoundHandler()` → 同样进异常过滤器 |
| Servlet Filter 链 | Express 中间件（`app.use`） |

读 `node_modules/@nestjs/platform-express/adapters/express-adapter.js` 与 `@nestjs/core/nest-application.js` 能拿到四条实现事实：

1. **每个 controller 方法都注册成一条真正的 Express 路由**（`RouterMethodFactory` 按动词取 `app.get/app.post/...`）。Nest 的抽象只到装饰器和生命周期，不到路由算法。
2. Express **对注册顺序敏感**（源码里就是 `httpAdapter.isRouteOrderSensitive()`，注释点名 Fastify 不敏感）。Nest 12 为此新增了「按特异性排序」和「路由冲突检测」两个开关（`getRouteResolutionStrategy()` / `getRouteConflictPolicy()`），**默认都不开**。默认行为是「声明顺序 = 注册顺序」，所以把 `@Get(":id")` 写在 `@Get("new")` 之前，`/api/products/new` 会被前者吃掉并撞上 `IdParamSchema` → 400 而不是 404。Spring 的 `HandlerMapping` 自动按特异性排序，没这个坑；Laravel 路由也按注册顺序匹配，所以这条规则你早就在用。
3. **异常过滤器和 not-found 是最后挂上去的 Express 中间件**（`registerRouterHooks()` → `registerNotFoundHandler()` + `registerExceptionHandler()`），位于所有路由之后——第 2 节那条 404 规律就是这么来的。
4. **body parser 由 Nest 自动注册**（`express.json()` + `express.urlencoded()`），等价于 Boot 的 Jackson converter；要原始字节用 `NestFactory.create(AppModule, { rawBody: true })`，要关掉用 `{ bodyParser: false }`（自己做签名校验时必需）。

> 换 Fastify 只换适配器（`@nestjs/platform-express` → `@nestjs/platform-fastify`），装饰器与生命周期不动；但 `@Res()` 拿到的是 Fastify reply，`response.location()` 这类 Express 专有 API 要改，`@Res({passthrough:true})` 的语义也有细微差别——抽象层的边界就在这里。e2e 用的 `app.getHttpServer()` 返回的就是这个 Express app，`supertest` 直接挂它、不需要真起端口（对照 `@SpringBootTest(webEnvironment = MOCK)` + MockMvc）。

## 4. Controller 与参数装饰器

[product.controller.ts](../code/shop-api/src/product/product.controller.ts) 去掉注释后的骨架：

```ts
/** 路径参数 `:id` 永远是 string，这里显式转换 + 校验（非数字 → 400 参数错误）。 */
const IdParamSchema = z.coerce.number().int().positive("必须是正数");

@Controller("api/products")
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(ProductQuerySchema)) query: ProductQuery) {
    return this.products.search(query);
  }

  @Public()
  @Get(":id")
  one(@Param("id", new ZodValidationPipe(IdParamSchema)) id: number) {
    return this.products.get(id);
  }
}
```

`create()` 是 `@Post() + @HttpCode(201)` 并用 `@Res({passthrough:true})` 设 `Location`（见第 10 节）；`remove()` 是 `@Delete(":id") + @HttpCode(204) + @Roles("ADMIN")` 返回 `void`，对应 Java 的 `@ResponseStatus(NO_CONTENT) + void`。

> **坑：`:id` 永远是 `string`。** Spring 的 `@PathVariable long id` 由转换器自动 widen，Laravel 里 `{id}` 也是字符串但模型绑定会帮你转。Nest 不转：`@Param("id") id: number` 的类型注解是**谎言**，运行时它还是 `"3"`。后果分级：`if (id === 3)` 恒假（编译期无警告）；`Map<number, X>` 键对不上；`WHERE id = ?` 在 SQLite 靠隐式转换「碰巧对」，换 PG 直接 `operator does not exist: integer = text`。本仓库的解法是把转换写进管道——`z.coerce.number().int().positive()`，转换与校验同一处完成。
> 另一个语法坑：Nest 12 的路径交给 `path-to-regexp`，老写法 `/products/*` 已不合法，要写 `/products/{*rest}`（源码里有一条明确的错误提示）。`@Controller("api/products")` 与 `@Get(":id")` 都不带前导斜杠，Nest 会补齐。

三类自定义装饰器的分工（对照 Spring）：

| Nest | 机制 | Spring 对应 | 实例文件 |
|---|---|---|---|
| `@Public()` / `@Roles("ADMIN")` | `SetMetadata` 写自定义键，守卫用 `Reflector` 读 | `permitAll()` / `@PreAuthorize` | [roles.decorator.ts](../code/shop-api/src/auth/roles.decorator.ts) |
| `@CurrentUser()` | `createParamDecorator` 从 request 取值 | `@AuthenticationPrincipal` | [zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts) |
| `@Timed("...")` | 方法装饰器替换 `descriptor.value` | `@Around` + `@Aspect` | [timed.decorator.ts](../code/shop-api/src/common/timed.decorator.ts) |

权限规则的**位置**是最大的手感差异。[roles.decorator.ts](../code/shop-api/src/auth/roles.decorator.ts) 的注释原话：Java 版把规则写在 `SecurityConfig` 的 matcher 链里（URL → 权限），Nest 的惯用法是把权限写在**路由旁边**（装饰器 + 全局 Guard）——「两种风格都能表达同一套规则，区别是规则离入口近还是离代码近」。代价：新增路由忘写 `@Public()` 就是 401（安全方向上失败，可接受）；集中式忘了配就是**裸奔**。

## 5. `ZodValidationPipe` vs `@Valid` vs FormRequest

[zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts)：

```ts
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, _meta: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new ValidationFailure(toFieldErrors(result.error as ZodError), result.error);
  }
}
```

失败时抛的是 `ValidationFailure extends BadRequestException`（携带 `fieldErrors` 与原始 `ZodError`），让过滤器一眼识别「这是校验失败，要带 errors 字段」——等价于 Spring 靠 `MethodArgumentNotValidException` 这个类型本身做分派。

| 维度 | Laravel FormRequest | Spring `@Valid` | 本仓库 |
|---|---|---|---|
| 规则在哪 | `rules()` 数组 | 字段上的注解 | Zod schema，**在 `@shop/shared`，前端也用同一份** |
| 触发方式 | 参数类型提示自动解析 | 方法参数上的 `@Valid` | 参数装饰器上手动挂管道实例 |
| 失败状态码 | 422 | 400 | 400（与 Java 版一致，故意不用 422） |
| 字段错误结构 | `{"errors": {"name": ["…"]}}`（数组） | `properties.errors` map | `errors: {"name": "不能为空"}`，**第一条胜出**（同 Spring `putIfAbsent`） |
| 类型转换 | `cast()` / `$request->integer()` | 由 `Converter` 完成 | schema 的 `transform` / `z.coerce` |

**这个管道同时做转换**。`@Valid` 之后参数类型不变；`ZodValidationPipe` 之后 `price` 已经是品牌字符串 `DecimalAmount`（`"599.00"`），而入站 JSON 是数字 `599`。所以 [shared/product.ts](../code/packages/shared/src/product.ts) 里两个类型并存：

```ts
export type CreateProductRequest = z.input<typeof CreateProductRequestSchema>;  // 入站：number | string
export type CreateProductInput = z.infer<typeof CreateProductRequestSchema>;    // 出站：DecimalAmount
// field-errors.ts 的拍平规则：数字段 → [i]，对象段 → a.b，表单级问题 → "_"
if (!(field in result)) result[field] = issue.message;   // 同字段多条问题：第一条胜出
```

> 命名纪律：`z.input` 是调用方给的形状，`z.infer` 是管道交给 Service 的形状。schema 里只要有 `.default()` / `.transform()` / `.coerce`，两者就**必然不同**——把它们写成同一个类型的人，会在某个 `?? 0` 处被编译器问倒。转换发生在管道，所以 `stock` 缺省能被补成 0（`z.int().min(0).default(0)`），对齐 Java 侧 primitive `int` 的默认值语义。

实测错误键与 Java 逐字一致（[field-errors.ts](../code/packages/shared/src/field-errors.ts)）：`items:[{productId:1,quantity:100}]` → `errors["items[0].quantity"] = "必须小于或等于 99"`；`items: []` → `errors["items"] = "不能为空"`。前端不必为两种后端写两套映射。

**管道为什么是实例而不是全局类？** 一个 `ZodValidationPipe` 绑死一个 schema，而 schema 是按参数不同的。想全局挂（`app.useGlobalPipes(...)`）需要先有一套「从 `ArgumentMetadata` 反查 schema」的注册表；本仓库没做，代价是 controller 里出现八次 `new ZodValidationPipe(...)`。用 Laravel 类比：等于每个参数手写一次 `->validate()`，而不靠 FormRequest 自动解析。

## 6. 全局异常过滤器 = `@RestControllerAdvice`

[problem.filter.ts](../code/shop-api/src/common/problem.filter.ts) 是 `@Catch()`（不带参数 = 捕获所有），分支按「具体异常在前、`HttpException` 兜底、最后 500」排列：

```ts
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ValidationFailure) {
      this.writeProblem(response, 400, validationProblem(exception.fieldErrors));
      return;
    }
    if (exception instanceof InsufficientStockException) {
      this.writeProblem(response, 409, insufficientStockProblem({
        sku: exception.sku, requested: exception.requested, available: exception.available,
      }));
      return;
    }
```

异常层级与 Java 一一对应（[domain-errors.ts](../code/shop-api/src/common/domain-errors.ts)）：`NotFoundException`→404 `资源不存在`、`ConflictException`→409 `业务冲突`、`OptimisticLockException`→409 `并发冲突`、`DataIntegrityException`→409 `数据冲突`、`BadRequestException`→400 `非法请求`、`InsufficientStockException`→409 `库存不足`。

| 关注点 | Laravel | Spring | Nest 本仓库 |
|---|---|---|---|
| 注册位置 | `bootstrap/app.php` 的 `withExceptions` | `@RestControllerAdvice` | `APP_FILTER` provider（可 `@UseFilters` 局部覆盖） |
| 方法分派 | `reportable()` / `renderable()` | `@ExceptionHandler(X.class)` 按类型选方法 | 一个 `catch()` 里 `instanceof` 顺序判断 |
| 错误体 | `{"message","errors"}` | `ProblemDetail` | `ProblemDetail`（同形状） |
| 未知异常 | Whoops + 500 页 | `/error` + 500 | `logger.error` + 手写 500 体（**绝不回显 `exception.message`**） |

**契约形状是手写函数，不是框架给的**（[shared/problem.ts](../code/packages/shared/src/problem.ts)）：

```ts
export function insufficientStockProblem(detail: InsufficientStockDetail): ProblemDetail {
  return {
    title: "库存不足", status: 409,
    detail: `库存不足 sku=${detail.sku} 需要=${detail.requested} 剩余=${detail.available}`,
    sku: detail.sku, requested: detail.requested, available: detail.available,
  };
}
```

三个刻意对齐点：① **没有 `type` / `instance` 键**——Spring 的 `ProblemDetail.forStatusAndDetail()` 只填 status+detail，再显式 `setTitle()`，Jackson mixin 是 NON_EMPTY，线上本来就没这两个键；② 业务附加字段（`sku/requested/available`）**平铺在顶层**，等价于 `problem.setProperty("sku", …)`；③ `ProblemDetailSchema` 用 `.loose()`，多余字段不会被前端 schema 拒绝。

> 两个真实陷阱。① `writeProblem()` 里是 `response.status(status).type("application/problem+json").send(JSON.stringify(problem))`——**接管式**写法：Nest 的拦截器 `map`、`@Header()`、默认序列化都不参与。② 如果不接管，Nest 12 会用 `response.json(body)` 输出，Content-Type 是 `application/json` 而不是 `problem+json`（适配器里甚至有一条警告文案：`Content-Type doesn't match Reply body, you might need a custom ExceptionFilter`）。也就是说 **媒体类型契约是过滤器的职责**，框架不会替你对齐 RFC 9457。

## 7. 401 / 403 的特例分支

这段是整份代码里最「反直觉」的部分，但它是**对齐**出来的，不是设计出来的。过滤器里对 `HttpException` 做了一道分流：`status === 401 || 403` 时不走 `writeProblem`，改走 `writeSecurityError`：

```ts
  /** 复刻 Spring Security 的 Accept 分支行为（README 的 curl 走查依赖「Accept 为通配」那条）。 */
  private writeSecurityError(response: Response, request: Request, status: number, path: string): void {
    const accept = request.headers.accept ?? "";
    const wantsJson = accept.includes("application/json") || accept.includes("text/json");
    if (wantsJson) { response.status(status).end(); return; }   // 空 body，无 WWW-Authenticate
    response.setHeader("WWW-Authenticate", 'Basic realm="Realm"');
    response.status(status).json({ timestamp: new Date().toISOString(), status,
      error: status === HttpStatus.UNAUTHORIZED ? "Unauthorized" : "Forbidden", path });
  }
```

| 请求 | 实测响应 |
|---|---|
| `POST /api/products`，`Accept: */*`，无凭证 | 401 + `WWW-Authenticate: Basic realm="Realm"` + `{"timestamp":"…","status":401,"error":"Unauthorized","path":"/api/products"}` |
| 同上，`Accept: application/json` | 401，**空 body、无 `WWW-Authenticate`、无 `X-Elapsed-Ms`** |
| `DELETE /api/products/{id}`，customer | 403 + `WWW-Authenticate` + `{"…","error":"Forbidden",…}` |

为什么 401 不是 `problem+json`？因为在 Java 版里它不是应用代码产生的——Spring Security 在进入 `DispatcherServlet` 之前就返回了，走 Boot 的 `BasicErrorController` 形状 + `sendError` 的内容协商。要让两份代码横向对比有意义，就得把这段「本来不属于你的框架行为」照抄。`BootStyleErrorSchema`（[shared/problem.ts](../code/packages/shared/src/problem.ts)）就是为这个形状写的契约，e2e 里两条 Accept 分支断言逐字对着它。

> 生产别学这里。要么把 401 也统一成 problem+json（客户端只处理一种错误体），要么换 JWT 让 `WWW-Authenticate` 语义更明确。保留差异是为了教学上的可对比性——把差异说清楚比假装优雅值钱。

## 8. `X-Request-Id` 与 `X-Elapsed-Ms`

[request-id.middleware.ts](../code/shop-api/src/common/request-id.middleware.ts) 照抄 Java `RequestIdFilter` 的三条规则：

```ts
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = candidate && candidate.trim().length > 0 ? candidate : randomUUID();
  req.requestId = requestId;                    // ③ 挂到 request，供守卫/过滤器/日志用
  res.setHeader(REQUEST_ID_HEADER, requestId);  // ② 业务之前写回，4xx/5xx 也带着
  next();                                       // ≈ return $next($request);
}
```

要点：① 进来的 id **原样复用**（网关 trace 要贯穿；e2e 里 `trace-from-gateway-1` 那条断言测的就是它）；② header 名一律小写，所以读的时候 `toLowerCase()`——PHP 里 `$request->header()` 大小写不敏感的直觉在这里失效；③ **绝不放模块级变量**（注释原话：「Node 里进程常驻，绝不能把请求级状态存进模块级变量，会串到别的请求上」）。

[timing.interceptor.ts](../code/shop-api/src/common/timing.interceptor.ts)：

```ts
    if (!url.startsWith("/api/")) return next.handle();

    const start = performance.now();
    return next.handle().pipe(
      finalize(() => {
        const elapsed = Math.max(0, Math.round(performance.now() - start));
        // headersSent 之后 setHeader 会抛错；这里只可能在写响应之前
        if (!response.headersSent) response.setHeader("X-Elapsed-Ms", String(elapsed));
      }),
    );
```

`finalize` ≈ `afterCompletion`：成功、失败、被取消都会走。对照 Java 的 `addPathPatterns("/api/**")`，这里用 `url.startsWith("/api/")` 手动把 actuator 排除。差异提醒：Spring 的 `afterCompletion` 直接收到 `Exception`，Nest 的 `finalize` 只知道「流结束了」，状态得读 `response.statusCode`，而且异常过滤器可能已经 `send` 过——这就是 `headersSent` 那行守卫存在的原因。

> 为什么不用 `AsyncLocalStorage` 存 requestId？可以用，Nest 官方 `NestMiddleware` + request-scoped provider 就是靠它。本仓库挂 `request` 对象，因为零成本、零心智负担，且同步调用栈里不需要传播。真要做「日志自动带 traceId」再上 ALS（[docs/03](./03-JS运行时与事件循环.md) 与 [docs/15](./15-生产化.md)）。

## 9. `@Timed` vs Spring AOP：自调用为什么照样生效

[timed.decorator.ts](../code/shop-api/src/common/timed.decorator.ts) 的核心：

```ts
    const original = descriptor.value;
    descriptor.value = function wrapped(this: { metrics?: Metrics }, ...args: any[]): any {
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const elapsed = Math.round(performance.now() - start);
        this.metrics?.record(name, elapsed);
      }
    };
```

| 维度 | Spring `@Aspect` + `@Around` | Nest 方法装饰器 |
|---|---|---|
| 机制 | 运行时生成代理（JDK/CGLIB），**换的是对象引用** | 编译期改写原型上的 `descriptor.value`，**换的是方法** |
| 自调用 `this.inner()` | ❌ 不经过代理，切面/`@Transactional` 失效 | ✅ 走同一个原型方法，照样生效 |
| 切点表达力 | AspectJ 表达式（包/注解/签名） | 只能装饰「看得见的那一个方法」；切面本身是 Bean 能注入任何东西，这里只能靠 `this` + 字段名约定 |
| 异步 | 无此问题 | ⚠️ `original.apply()` 返回 Promise 时不 await，只量到「发起」 |

`OrderService.place` 上就挂着 `@Timed("OrderService.place")`，[order.service.spec.ts](../code/shop-api/src/order/order.service.spec.ts) 里有一条专门打 Java 那个坑的断言：

```ts
  it("@Timed 装饰器在自调用下也生效（对比 Java 的 @Transactional 代理失效）", () => {
    service.place({ customerName: "ben", items: [{ productId: 1, quantity: 1 }] });
    expect(metrics.count("OrderService.place")).toBe(1);
  });
```

代价三条，都是「没有代理」的另一面：① `this.metrics?.record(...)` 里的字段名是**约定**，所以 `ProductService`/`OrderService` 的 `metrics` 都写成 `readonly metrics: Metrics`（不带 `private`，装饰器 wrapper 才读得到）；② 计时只覆盖同步部分——这两个 Service 恰好是同步的（见 [docs/08](./08-数据访问与事务.md)），一旦 `await` 就得改成 async 包装并把 `finally` 挪到 `await` 之后；③ 拦不到继承来的方法，也不能靠配置批量开启（Spring 可以只切 `study.shop.service..*`）。

## 10. 动态状态码与 `Location`：`@Res({ passthrough: true })`

Spring 用 `ResponseEntity` 一次把状态码、头、体说完。Nest 的返回值只能表达 body，头要从 `response` 上「借」——[order.controller.ts](../code/shop-api/src/order/order.controller.ts)：

```ts
  @Post()
  @HttpCode(201)
  place(
    @Body(new ZodValidationPipe(PlaceOrderRequestSchema)) input: PlaceOrderInput,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    const created = this.orders.place(input);
    response.location(`/api/orders/${created.id}`);
    void user;
    return created;
  }
```

`passthrough: true` 是关键：**我参与设置头和码，body 仍交给框架序列化**，拦截器链与异常过滤器照常工作。不写它（默认接管）就必须自己 `res.send(...)`，`return created` 会被忽略——第 6 节的异常过滤器就是接管式的。空 body 的 204 用 `@HttpCode(204)` + 返回 `void`，对应 Java 的 `@ResponseStatus(NO_CONTENT) + void`。

需要**运行时决定状态码**（`@HttpCode` 是编译期常量）的写法在 [actuator.controller.ts](../code/shop-api/src/health/actuator.controller.ts)：

```ts
  @Public()
  @Get("health")
  health(@Res({ passthrough: true }) response: Response) { … response.status(dbStatus === "UP" ? 200 : 503); }
```

注释里那句话值得抄进脑子：「这类『运行时决定状态码』在 Spring 里靠 `ResponseEntity` 解决，Nest 的对等写法就是 passthrough 的 `@Res`」。

## 11. 实测响应表

服务以 `DB_FILE=/tmp/shop-verify.db node dist/main.js` 启动；演示数据 SKU-001 机械键盘 599.00/库存 20、SKU-002 人体工学椅 1299.00/库存 5、SKU-003 限量版鼠标 399.00/库存 2（id 1/2/3），账号 `admin/admin123`(ADMIN)、`customer/customer123`(CUSTOMER)——与 Java 应用完全一致。

| 请求 | 状态 | 响应 |
|---|---|---|
| `GET /api/products` | 200 | `[{id:2,sku:"SKU-002",name:"人体工学椅",price:1299,stock:5,version:0},{id:1,…,price:599,stock:20,…},{id:3,…,"限量版鼠标",price:399,stock:2,…}]`，头含 `X-Request-Id`（uuid）与 `X-Elapsed-Ms` |
| `POST /api/products`（无凭证，`Accept: */*`） | 401 | `{"timestamp":…,"status":401,"error":"Unauthorized","path":"/api/products"}` + `WWW-Authenticate: Basic realm="Realm"` |
| 同上，`Accept: application/json` | 401 | 空 body，无 `WWW-Authenticate` |
| `POST /api/orders`（customer，`{customerName:"ben",items:[{productId:1,quantity:2}]}`） | 201 | `Location: /api/orders/1` + `{"id":1,"customerName":"ben","status":"PENDING","total":1198,"createdAt":"2026-10-25T10:05:49.216","version":0,"items":[{"productId":1,"sku":"SKU-001","unitPrice":599,"quantity":2,"subtotal":1198}]}`；随后 `GET /api/products/1` → `{"id":1,…,"stock":18,"version":1}` |
| 库存不足下单 | 409 `application/problem+json` | `{"title":"库存不足","status":409,"detail":"库存不足 sku=SKU-003 需要=3 剩余=2","sku":"SKU-003","requested":3,"available":2}` |
| 参数校验失败 | 400 | `{"title":"参数错误","status":400,"detail":"请求参数校验失败","errors":{"customerName":"不能为空","items":"不能为空"}}`；嵌套键形如 `items[0].quantity` |
| 重复 SKU | 409 | `{"title":"业务冲突","status":409,"detail":"SKU 已存在: SKU-001"}` |
| 乐观锁版本不匹配 | 409 | `{"title":"并发冲突","status":409,"detail":"数据已被其他请求修改，请重试"}` |
| 唯一 / 外键约束 | 409 | `{"title":"数据冲突","status":409,"detail":"数据违反唯一性或外键约束"}` |
| 未知 id | 404 | `{"title":"资源不存在","status":404,"detail":"商品 不存在: 9999"}` |
| 业务规则（调小 `SHOP_MAX_ORDER_ITEMS`） | 400 | `{"title":"非法请求","status":400,"detail":"单笔订单最多 20 个商品行"}` |
| `DELETE /api/products/{id}` | 403 / 204 | customer → 403；admin → 204 **空 body** |
| `GET /actuator/health` | 200 | `{"status":"UP","components":{"db":{"status":"UP","details":{"database":"SQLite","file":"/tmp/shop-verify.db"}},"memory":{…},"ping":{"status":"UP"}}}` |
| `GET /actuator/info` | 200 | 公开（`app.name/description/version` + `runtime.node/pid`） |
| `GET /actuator/metrics` | 401 / 200 | 未认证 401；认证后 `{"counters":{"OrderService.place":1,…},"uptimeSeconds":N}` |

## 12. 与 Java 的唯一可见差异：`599` vs `599.00`

上表里 `price` 是 `599`，Java 版是 `599.00`。这不是 bug，是语言事实：**JS 的 number 是 double，字面量没有「几位小数」的概念，`JSON.stringify(599.00)` 一定是 `599`**；而 `BigDecimal` 自带 scale，Jackson 原样输出。

内部其实一直是精确的：[shared/decimal.ts](../code/packages/shared/src/decimal.ts) 用品牌字符串表示金额（`DecimalAmount`，形如 `"599.00"`），所有运算走整数分，只有 HTTP 出口降级成 number：

```ts
/** 出口格式化：把 "599.00" 变成 JSON number 599。…前端一律用本包的 schema 把它收回 DecimalAmount 字符串 */
export function toWireDecimal(amount: DecimalAmount): number {
  return Number(amount);
}
```

> **能不能做出 `599.00`？** 能，但要付代价：JSON 里没有「数字格式」，唯一办法是让响应体不再是对象而是**手拼字符串**（占位符 + `JSON.stringify` 后 `replace`，或自定义序列化直接 `res.send(rawJson)`）。后果是：返回值不再是 DTO、拦截器看不到结构化结果、`@Res({passthrough:true})` 的风格全废、契约测试要按字节比。本仓库选择**诚实标注差异**（语义等价、字面不同），并用 `DecimalInputSchema`（`z.union([z.number(), z.string()])` → `DecimalAmount`）在入口把它收回来，所以差异被挡在 `toWireDecimal()` 这一层。
> **架构结论**：跨语言对齐 API 时，先把「不可能对齐的地方」列成清单并写成测试，比为了逐字节一致牺牲整条序列化链更划算。真需要精度契约时，正确做法是双方都用字符串（`"price": "599.00"`）——那要改客户端，而不是给序列化打补丁。

## 13. OpenAPI / Swagger 的取舍

本仓库**没有** `@nestjs/swagger` 依赖（见 [shop-api/package.json](../code/shop-api/package.json)）。理由是契约的真相在 `@shop/shared` 的 Zod schema，不在 controller 的装饰器上。

| 需求 | 常规做法 | 本仓库做法 |
|---|---|---|
| 人读文档 | `@nestjs/swagger` → `/api/docs` | 手写表格（就是第 11 节）+ `ProblemDetailSchema` |
| 前端类型 | `openapi-typescript` 生成 | `import type { ProductResponse } from "@shop/shared"`——**运行时还能校验**，生成的类型做不到 |
| 契约防漂移 | 快照测试 / PRD 评审 | [shop-api.e2e.spec.ts](../code/shop-api/test/shop-api.e2e.spec.ts) 逐条断言 body 与 header；[schemas.test.ts](../code/packages/shared/test/schemas.test.ts) 断言 schema 与 Java 侧请求体互解；错误体另有 `ProblemDetailSchema` + `BootStyleErrorSchema` 两个 Zod schema，前端 parse 服务端响应 |
| 真要给对接方 | — | `zod-to-json-schema` 出 OpenAPI；`@nestjs/swagger` 的 `@ApiProperty` 要逐 DTO 手写注解，而这里的 DTO 是 `z.infer` 推导的，所以只能走 schema → JSON Schema 这条路 |

> 讲透取舍：`@nestjs/swagger` 靠**额外一层装饰器**描述契约，于是「代码是对的」和「文档是对的」变成两件事——PHP/Java 项目里 Swagger 注解与实际校验规则漂移是常态。Zod 单源能消掉这类漂移，代价是缺 `example`/`description` 这类文档语料，需要 `.describe()` 补；对接方多时这份成本该付就付。

## 14. 本章自测

1. 某次抓包看到一条 400 `application/problem+json`，但响应头里没有 `X-Elapsed-Ms`。列出至少三种可能原因。
2. `@Param("id") id: number` 与 `@Param("id", new ZodValidationPipe(IdParamSchema)) id: number` 的运行时差别是什么？给一个会因此产生 bug 的具体场景。
3. 把 401 也统一成 `problem+json` 要改哪几处？客户端会因此少掉什么能力？

<details>
<summary>参考答案</summary>

1. ① 这个 400 是**守卫**抛的（守卫在拦截器之前，见 [basic-auth.guard.ts](../code/shop-api/src/auth/basic-auth.guard.ts) 完全可以抛 `BadRequestException`）；② 它是 **Express/Nest 中间件层**抛的，典型是 body parser（`express.json()` 对畸形 JSON 或超大 body 直接给 400/413，发生在路由与拦截器之前）；③ 路径不以 `/api/` 开头，被 `if (!url.startsWith("/api/")) return next.handle();` 排除在计时之外；④ 有代码在拦截器之前就接管 `@Res()` 并 `send`，`headersSent` 已 true 使写头被跳过。反过来说，正常路径下 Pipe 抛的 400 与 Service 抛的 404 **是带** `X-Elapsed-Ms` 的（异常过滤器在拦截器之外、响应之前），实测就是 `X-Elapsed-Ms: 0`。
2. 前者运行时 `id` 是字符串 `"3"`（类型注解是谎言），后者拿到数字且非正数已被 400 拦掉。会翻车的场景：`if (id === 3)` 恒假；以 `id` 做 `Map` 键时 `"3"` 与 `3` 不是同一个键；`WHERE id = ?` 绑成字符串——SQLite 隐式转换看起来正常，PostgreSQL 直接报 `operator does not exist: integer = text`。
3. 改 [problem.filter.ts](../code/shop-api/src/common/problem.filter.ts)：把 401/403 分支换成 `writeProblem(...)`，删掉 `writeSecurityError()`；同时删 [shared/problem.ts](../code/packages/shared/src/problem.ts) 的 `BootStyleErrorSchema` 与 e2e 里那两条 Accept 分支断言（这会让 TS 与 Java 两份 API **不再逐字可比**，要写进 ADR）。客户端少掉的能力：浏览器/HTTP 客户端凭 `WWW-Authenticate` 自动弹基本认证框，以及靠内容协商区分「给人看」和「给程序读」的 401。
</details>
