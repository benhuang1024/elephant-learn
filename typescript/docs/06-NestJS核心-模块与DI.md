# 06 NestJS 核心：模块与依赖注入

> **配套代码（shop-api）**
> 组合根与入口：[app.module.ts](../code/shop-api/src/app.module.ts)、[main.ts](../code/shop-api/src/main.ts)
> 七个模块：[auth.module.ts](../code/shop-api/src/auth/auth.module.ts)、[common.module.ts](../code/shop-api/src/common/common.module.ts)、[database.module.ts](../code/shop-api/src/db/database.module.ts)、[product.module.ts](../code/shop-api/src/product/product.module.ts)、[order.module.ts](../code/shop-api/src/order/order.module.ts)、[health.module.ts](../code/shop-api/src/health/health.module.ts)
> Provider 与生命周期：[database.ts](../code/shop-api/src/db/database.ts)、[demo-data.seeder.ts](../code/shop-api/src/product/demo-data.seeder.ts)、[users.service.ts](../code/shop-api/src/auth/users.service.ts)
> 装饰器元数据：[roles.decorator.ts](../code/shop-api/src/auth/roles.decorator.ts)、[timed.decorator.ts](../code/shop-api/src/common/timed.decorator.ts)、[tsconfig.json](../code/shop-api/tsconfig.json)、编译产物 [dist/product/product.service.js](../code/shop-api/dist/product/product.service.js)
> 环境配置：[config/env.ts](../code/shop-api/src/config/env.ts)

## 1. 三方对照：ServiceProvider / `@Configuration` / `@Module`

| 你已有的概念 | Laravel | Spring | NestJS（本仓库） |
|---|---|---|---|
| 容器本体 | Service Container | `ApplicationContext` | `ModuleContainer` + `Injector` |
| 注册一个类 | 自动绑定（反射构造器） | `@Component` + 组件扫描 | 写进某个模块的 `providers: []` |
| 集中声明依赖 | `ServiceProvider::register()` | `@Configuration` + `@Bean` | `@Module({ providers: [{ provide, useXxx }] })` |
| 路由/入口注册 | `routes/api.php` | `@RestController` 扫描 | `@Controller` 写进 `controllers: []` |
| 边界 | 无（容器全局） | 无（Bean 全局可见） | **模块私有，必须 `exports` 才能被别的模块注入** |
| 按类型解析 | 构造器 type-hint | 构造器（`design:paramtypes` 的 Java 版） | 构造器 + `reflect-metadata` |
| 同一接口多实现 | `bind()` / contextual binding | `@Primary` / `@Qualifier` | 字符串或 symbol token + `@Inject()` |
| 拿到全部实现 | tagged services | 注入 `Map<String, Iface>` | 注入数组需要自建 token（Nest 没有内置） |
| 测试里替换 | `$this->app->instance()` | `@MockBean` | `overrideProvider(X).useValue(...)` |
| 默认作用域 | `bind` 每次 new / `singleton` 显式 | `singleton` | **单例**（默认） |
| 配置来源 | `config/*.php` + `.env` | `application.yml` + Profile | `.env` + Zod 收敛（见第 7 节） |

一句话心智差：**Nest 不扫包，一切都得显式列出**。`product.module.ts` 的注释把这件事说得很直白：

```ts
/**
 * ProductModule：Controller + Service + Repository 三层，与 Java 包结构一致。
 * Repository 也要写进 providers —— Nest 不会自动扫描类，**一切依赖都要显式注册**，
 * 这一点和 Laravel 的自动绑定、Spring 的 @Repository 组件扫描都不一样。
 */
```

代价是啰嗦，收益是「容器里有什么」在文件里可查、可 grep、启动即可失败。

## 2. 组合根：`AppModule` 只做装配

[app.module.ts](../code/shop-api/src/app.module.ts)：

```ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
    }),
    CommonModule,
    DatabaseModule,
    AuthModule,
    ProductModule,
    OrderModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: BasicAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestTimingInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
```

对照关系：`@SpringBootApplication` = 组件扫描 + auto-configuration；Laravel 的 `bootstrap/providers.php` = 显式列表。Nest 属于后者，而且比 Laravel 更严：连「这个 Controller 属于哪个模块」都要写。

`APP_GUARD` / `APP_INTERCEPTOR` / `APP_FILTER` 是 `@nestjs/core` 导出的**内置 token**，作用等价于 Spring 的「注册一个 `SecurityFilterChain` / `HandlerInterceptor` / `@RestControllerAdvice` Bean」。它们的执行顺序由框架固定，与注册顺序无关：

```
Middleware → Guard → Interceptor(前) → Pipe → Controller → Service → Interceptor(后) → Filter
```

（这条链在 [docs/07](./07-NestJS-Web与REST.md) 逐段对照代码走一遍。）

## 3. 模块 = 有边界的子容器

本仓库七个模块的实际内容：

| 模块 | imports | providers | controllers | exports |
|---|---|---|---|---|
| `AppModule` | ConfigModule(forRoot)、其余六个 | 三个 APP_* token | — | — |
| `CommonModule`（`@Global()`） | — | `Metrics` | — | `Metrics` |
| `DatabaseModule` | — | `DatabaseService` | — | `DatabaseService` |
| `AuthModule` | — | `UsersService`、`BasicAuthGuard` | — | 两者 |
| `ProductModule` | `DatabaseModule` | `ProductService`、`ProductRepository`、`DemoDataSeeder` | `ProductController` | `ProductService` |
| `OrderModule` | `DatabaseModule` | `OrderService`、`OrderRepository` | `OrderController` | `OrderService` |
| `HealthModule` | `DatabaseModule` | — | `ActuatorController` | — |

`DatabaseModule` 只有一个 provider，看起来啰嗦，但 [database.module.ts](../code/shop-api/src/db/database.module.ts) 的注释点明了价值：**封装与显式导出**。别的模块拿到的是 `DatabaseService`，拿不到 `better-sqlite3` 的裸连接对象——除非你显式导出它。

`HealthModule` 值得单独看：它的 `ActuatorController` 注入了 `Metrics`，但模块里**没有 import CommonModule**：

```ts
@Module({
  imports: [DatabaseModule],
  controllers: [ActuatorController],
})
export class HealthModule {}
```

能跑通的原因是 [common.module.ts](../code/shop-api/src/common/common.module.ts) 挂了 `@Global()`：

```ts
@Global()
@Module({
  providers: [Metrics],
  exports: [Metrics],
})
export class CommonModule {}
```

> **`@Global()` 要克制**。注释写得很坦白：一旦全局，任何模块都能悄悄依赖它，「这个依赖是谁提供的」就不再可读。Spring 的 Bean 天生全局，Nest 给了你选择的机会——只有一个 provider、无状态、跨模块都要用的东西（指标、日志、时钟）才值得全局。
> 顺手一个真实观察：`ProductModule` 导出了 `ProductService`，但目前没有任何模块 import 它；订单是直接查 `products` 表的（见 [docs/08](./08-数据访问与事务.md)）。导出没坏处，但别把它当文档。

## 4. 装饰器与 `reflect-metadata` 到底提供了什么

TS 的类型在编译期就消失了（[docs/01](./01-TypeScript语言速通.md)），运行时唯一还能看出「这个参数是什么类」的东西，是 `emitDecoratorMetadata` 生成的元数据。看真实编译产物 [dist/product/product.service.js](../code/shop-api/dist/product/product.service.js)：

```js
let ProductService = class ProductService {
    constructor(products, config, metrics) { ... }
};
ProductService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ProductRepository,
        ConfigService,
        Metrics])
], ProductService);
```

`design:paramtypes` 就是 Nest 的构造器注入全部依赖：它按顺序读这三个类引用，去容器里查，查不到就报错。所以：

| 装饰器 | 写进元数据的键 | 谁读它 | Laravel/Spring 近似 |
|---|---|---|---|
| `@Injectable()` | 「这个类可被容器实例化」 | Injector | `@Component` / 自动绑定 |
| `@Controller("api/products")` | 路径前缀 + 方法上的 `PATH/METHOD` | RoutesResolver | `@RequestMapping` / `routes/api.php` |
| `@Get(":id")` | 方法路径 + HTTP 动词 | RoutesResolver | `@GetMapping` / `Route::get()` |
| `@Body()/@Param()/@Query()` | 参数索引 + 来源 | 参数管道 | 参数解析器 / `$request->input()` |
| `SetMetadata(KEY, value)` | 自定义键 | `Reflector` | `@PreAuthorize` 的注解元数据 |
| `@Catch()` | 「我是异常过滤器」 | ExceptionsHandler | `@RestControllerAdvice` |

`main.ts` 第一行 `import "reflect-metadata";` 不是可选的仪式感：Node 至今没实现 `Reflect.metadata`，这个 polyfill 必须先加载，`__metadata(...)` 调用才不会静默失效（失效的表现是 DI 报「can't resolve dependencies」）。

配套的开关在 [tsconfig.json](../code/shop-api/tsconfig.json)：

```json
"experimentalDecorators": true,
"emitDecoratorMetadata": true,
"useDefineForClassFields": false,
```

> **TS 7 上的实情**：`emitDecoratorMetadata` 依然可用（tsc 照样产出上面的 `__metadata`），所以本仓库不需要 SWC/nest-tsc 那套编译链。Nest 官方文档还在推荐 `tsc -p tsconfig.build.json`，这条路在 TS 7 上是通的。

### 三个必须由元数据解释的坑

**坑 1：接口不能当注入 token。** 类型擦除后 `interface` 什么都不剩，`design:paramtypes` 只能记录「运行时存在的值」。编译产物里就有现成证据——被 `@Timed` 装饰的方法，参数元数据是 `Object`：

```js
__decorate([
    Timed("ProductService.create"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ProductService.prototype, "create", null);
```

因为 `CreateProductInput` 是 `z.infer` 出来的类型别名。同理，写 `constructor(private store: ProductStore)`（`ProductStore` 是 interface）时 DI 一定失败，必须换字符串 token + `@Inject()`。

**坑 2：`import type` 会让类引用从运行时消失。** 想注入的依赖一定要用值 import。[product.service.ts](../code/shop-api/src/product/product.service.ts) 的写法是刻意分开的：

```ts
import { Metrics } from "../auth/users.service.js";              // 注入用：值 import
import type { ProductQuery } from "@shop/shared";                 // 只做类型：type import
```

**坑 3：装饰器在 import 阶段求值。** `@Module({ imports: [AuthModule] })` 里的 `AuthModule` 必须已经完成初始化。循环 import（A 引 B、B 引 A）会命中 `ReferenceError: Cannot access 'B' before initialization`，这是 Nest 里最经典的循环依赖报错，而不是 Spring 的 `BeanCurrentlyInCreationException`。解法见第 8 节。

## 5. Token 的三种形态与四种注册方式

| 写法 | 本仓库实例 | 什么时候用 |
|---|---|---|
| 类即 token：`providers: [ProductService]` | [product.module.ts](../code/shop-api/src/product/product.module.ts) | 唯一实现、按类型注入。等价于 `{ provide: ProductService, useClass: ProductService }` |
| 内置抽象 token：`{ provide: APP_GUARD, useClass: ... }` | [app.module.ts](../code/shop-api/src/app.module.ts) | 把一个类挂到框架扩展点 |
| 字符串/symbol token：`{ provide: "CACHE", useValue: ... }` | 本仓库没有 | 同一接口多实现、注入第三方对象、配置对象 |
| `useValue` | [order.service.spec.ts](../code/shop-api/src/order/order.service.spec.ts)：`{ provide: DatabaseService, useValue: { db } }` | 替换依赖（测试）、注入非类实例 |
| `useFactory` | 本仓库没有；替代品是独立工厂函数 `createDatabase()` | 构造需要异步/条件逻辑，或不想让依赖关系进类里 |
| `useExisting` | 本仓库没有 | 别名 token，**复用同一个实例** |

`useValue` 那行值得看全：测试里用一个只有 `db` 字段的对象顶掉整个 `DatabaseService`：

```ts
const moduleRef = await Test.createTestingModule({
  providers: [
    OrderService,
    OrderRepository,
    Metrics,
    { provide: DatabaseService, useValue: { db } },
    {
      provide: ConfigService,
      useValue: {
        get: (key: string): unknown =>
          key === "SHOP_MAX_ORDER_ITEMS" ? 20 : key === "SHOP_CURRENCY" ? "CNY" : undefined,
      },
    },
  ],
}).compile();
```

注意两点：① Nest 的测试容器要求你**显式列出所有 provider**，没有 `@SpringBootTest` 那种「扫一遍就有了」；② `ConfigService` 被换成一个手写的 `get`，因为 `@Global()` 的 ConfigModule 没有被 import 进来。

更「裸」的一层在 [product.repository.spec.ts](../code/shop-api/src/product/product.repository.spec.ts)：

```ts
function repositoryWith(db: ReturnType<typeof createDatabase>["db"]): ProductRepository {
  // 只依赖 .db 一个字段，所以用结构等价对象代替 DatabaseService（docs/09 讨论 mock 策略）
  return new ProductRepository({ db } as unknown as DatabaseService);
}
```

**不启动容器也能 new。** 这是 TS 结构类型 + 显式工厂（`createDatabase`）的红利：Spring 侧要 `@DataJpaTest` 起上下文，这里直接 `new`。Laravel 里你也是这么干的，只是没人会拿它跟 IoC 容器比。

### 一个真实的双实例细节

`AppModule` 里 `{ provide: APP_GUARD, useClass: BasicAuthGuard }` 会在 **AppModule 的上下文**里实例化一个 `BasicAuthGuard`；而 `AuthModule` 自己的 `providers` 里也列了同一个类，那个实例并没有被全局守卫复用。也就是说这个仓库里理论上存在两个 `BasicAuthGuard`。因为守卫无状态（只注入 `Reflector` 和 `UsersService`），没有任何可观察差异——但如果你需要一个跨模块共享的有状态守卫，正确写法是：

```ts
// 示意，本仓库未采用：复用 AuthModule 导出的那一个实例
providers: [{ provide: APP_GUARD, useExisting: BasicAuthGuard }],
```

前提是 `BasicAuthGuard` 被 `AuthModule` 导出且 `AuthModule` 被 import——`auth.module.ts` 恰好两件都做了。

## 6. 作用域：默认单例，以及 `REQUEST` 为什么是性能陷阱

| 作用域 | Nest 写法 | Spring 对应 | Laravel 对应 | 何时该用 |
|---|---|---|---|---|
| 单例（默认） | `@Injectable()` | `singleton` | `singleton()` | 99%：Service、Repository、Client |
| `Scope.REQUEST` | `@Injectable({ scope: Scope.REQUEST })` | `request` scope | 手动从容器 `make` | 真的需要「每请求一个实例」的有状态对象 |
| `Scope.TRANSIENT` | `@Injectable({ scope: Scope.TRANSIENT })` | `prototype` | `bind()` | 每次注入都要新副本（少用） |

本仓库**一个 REQUEST/TRANSIENT 都没有**，这是刻意的。理由：

1. Node 是常驻单进程单线程，一个实例服务所有请求。[users.service.ts](../code/shop-api/src/auth/users.service.ts) 里的账号表在**构造时**就把密码摘要算好存进 `Map`，[common.module.ts](../code/shop-api/src/common/common.module.ts) 的 `Metrics` 也是进程级 `Map`——这些都是有意保留的单例状态，代价是重启即丢、`cluster` 下每个 worker 各有一份（对照 PHP：请求即死，你从来没机会持有状态）。
2. 一旦某个 provider 是 REQUEST scope，**依赖它的上游会被连带升级**：Controller → Service → Repository 整条链变成每请求重新构造。[database.ts](../code/shop-api/src/db/database.ts) 这种持有 SQLite 文件句柄的对象一旦被拖进 REQUEST 链，就是每请求建连/关连——性能塌得非常快。
3. 请求级数据的正确去处是 **request 对象 + 参数装饰器**，不是作用域。见 [request-id.middleware.ts](../code/shop-api/src/common/request-id.middleware.ts) 的注释：

```ts
 * 与 PHP 的差异：Laravel/Symfony 的请求 id 通常靠 Monolog Processor 注入；
 * Node 里进程常驻，**绝不能把请求级状态存进模块级变量**（会串到别的请求上），
 * 必须挂在 request 对象上 —— 这是 share-nothing 直觉失效的第一个地方（docs/03）。
```

守卫把登录人挂上去（`request.user = user;`），[zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts) 用 `createParamDecorator` 取回来（`@CurrentUser()`）——这套写法等价于 Spring 的 `@AuthenticationPrincipal`，全程零 REQUEST scope。

## 7. 生命周期钩子

真实顺序（`@nestjs/core` 的 `nest-application.js` 里就是 `registerModules → registerRouter → callInitHook → registerRouterHooks → callBootstrapHook → listen`）：

| 阶段 | Nest 接口 | Spring 对应 | Laravel 对应 | 本仓库实例 |
|---|---|---|---|---|
| 实例化 + 注入 | `constructor` | 构造器注入 | `__construct` | `DatabaseService`（构造时建连 + 建表） |
| 模块初始化 | `OnModuleInit` | `@PostConstruct` | `boot()` | 无实现者（见下） |
| 应用初始化 | `OnApplicationBootstrap` | `ApplicationRunner` | `Artisan::call` 钩子 | `DemoDataSeeder` |
| 开始监听端口 | `app.listen()` | Tomcat start | — | [main.ts](../code/shop-api/src/main.ts) |
| 收到信号 | `OnApplicationShutdown` | `@PreDestroy`（有序） | SIGTERM handler | 无 |
| 模块销毁 | `OnModuleDestroy` | `DisposableBean#destroy` | destructor | `DatabaseService.close()` |

**建连为什么放在 constructor 而不是 `onModuleInit`**：`DemoDataSeeder` 在 bootstrap 阶段就要用 `ProductRepository`，而 `ProductRepository` 用的是 `DatabaseService.db`。放在 constructor 意味着「任何人拿到这个实例时它都已经可用」，不必推理模块初始化的先后。这个类只做销毁：

```ts
  /** 优雅停机时释放文件句柄（Spring 的 @PreDestroy / Laravel 的 destructor）。 */
  onModuleDestroy(): void {
    this.connection.close();
  }
```

**seed 为什么放在 bootstrap**：[demo-data.seeder.ts](../code/shop-api/src/product/demo-data.seeder.ts) 与 Java 版逐条对齐：

```ts
@Injectable()
export class DemoDataSeeder implements OnApplicationBootstrap {
  onApplicationBootstrap(): void {
    if (this.config.get<boolean>("SHOP_SEED_DEMO_DATA") !== true) {
      this.logger.log("SHOP_SEED_DEMO_DATA=false，跳过演示数据");
      return;
    }
    if (this.products.count() > 0) return;
```

对照 Java 的 `@ConditionalOnProperty(matchIfMissing = true)`：Spring 用条件装配在**创建 Bean 之前**决定要不要它，Nest 只能把 Bean 建出来、在回调里判断。差异是「少一次实例化」，实际影响可忽略；要注意的是别把昂贵操作塞进 `@Injectable` 的构造器。

**优雅停机必须显式打开**：

```ts
  const app = await NestFactory.create(AppModule);
  // X-Request-Id 必须是第一个：守卫、拦截器、异常过滤器都要能拿到它
  app.use(requestIdMiddleware);
  app.enableShutdownHooks();
```

Spring Boot 有 `server.shutdown: graceful` 且 `@PreDestroy` 默认生效；Nest 里不调 `enableShutdownHooks()`，`onApplicationShutdown` / `onModuleDestroy` 在 SIGTERM 下**一次都不会跑**——SQLite 句柄靠进程退出兜底，换成需要 flush 的东西（Kafka producer、连接池）就是丢数据。这是从 PHP 过来的人最容易漏的一行。

## 8. 环境配置：`ConfigModule` + Zod ≈ `@ConfigurationProperties`

三个框架做的是**同一件事**，只是校验声明的位置不同：

| 维度 | Laravel | Spring | 本仓库（Nest） |
|---|---|---|---|
| 来源 | `.env` + `config/*.php` | `application.yml` + Profile | `.env`（`ConfigModule` 加载）+ 进程环境变量 |
| 类型收敛 | 手工 `env()` / cast | record 构造器绑定 | `z.infer` 推导出的 `Env` |
| 校验 | 无（写到运行时才炸） | `@Validated` + Bean Validation | `EnvSchema.safeParse` |
| 失败时机 | 第一次 `config()` 返回 null | **启动时** | **启动时**（`validate` 回调抛错） |
| 访问 | `config('shop.currency')` | 注入 `ShopProperties` | `config.get<string>("SHOP_CURRENCY")` |

[config/env.ts](../code/shop-api/src/config/env.ts) 把边界收窄成强类型对象：

```ts
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  DB_FILE: z.string().default("shop.db"),
  SHOP_CURRENCY: z.string().length(3).default("CNY"),
  SHOP_MAX_ORDER_ITEMS: z.coerce.number().int().min(1).max(100).default(20),
  SHOP_SEED_DEMO_DATA: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof EnvSchema>;
```

`z.coerce.number()` 处理「环境变量永远是字符串」这件事（等价于 Spring 的 relaxed binding），`transform` 处理「`"true"` 不是 `true`」这件事。`validateEnv` 抛错就让进程起不来：

```ts
    throw new Error(`环境变量校验失败：\n${details}\n请检查 .env 或容器注入的变量。`);
```

> 对照 Java：`ShopProperties` 用 `@Min(1) @Max(100) int maxOrderItems`，Spring 在绑定阶段做同样的事。区别是 TS 里这层是**显式的一段代码**而不是注解，所以它也在 git diff 里、也在 review 范围内。

消费侧靠 `isGlobal: true` 免 import：`UsersService`、`ProductService`、`DemoDataSeeder`、`ActuatorController`、`DatabaseService` 都直接注入 `ConfigService`。

**关键差异与坑**：

1. **默认值双写**。schema 里 `.default("admin")`，代码里还写 `config.get<string>("ADMIN_USERNAME") ?? "admin"`。原因是 `ConfigService.get<T>()` 的 `T` 是你手写断言、编译器不会拿 `Env` 去核。真实项目里二选一：要么包一个类型安全的 `AppConfigService`（`getEnv()` 返回 `Env`），要么删掉所有 `??`。
2. **`ConfigService` 不是 `Env`**。`get("SHOP_SEED_DEMO_DATA")` 返回的运行时值是布尔（因为 `validate` 的返回值替换了 process.env 快照），但类型全靠你传的泛型 `<boolean>`。写错泛型不会报错——这是第 4 节「类型只活在编译期」在配置上的复现。
3. **Profile 没有内置机制**。Spring 有 `application-{profile}.yml`，Laravel 有 `config/app-{env}.php`；`@nestjs/config` 只提供 `envFilePath` 数组。想按环境切文件就自己拼 `envFilePath: [`.env.${process.env.NODE_ENV}.local`]`，但既然 `validateEnv` 已经收敛了类型，多数团队只留一份 `.env.example`。
4. **`cache: true`** 让 `get()` 走内部缓存——每次 `config.get()` 都重新解析大对象时值得开。

## 9. 常见坑清单

| 症状 | 原因 | 解法 |
|---|---|---|
| `Nest can't resolve dependencies of the ProductService (?, ConfigService, Metrics)` | 忘了把 `ProductRepository` 写进 `providers` | 加进 providers；Nest 不扫包 |
| 报错里第一个参数是 `?`，但类已经在 providers 里 | 提供方模块没 `exports`，或本模块没 `imports` | 补 exports/imports；不要用 `@Global()` 绕过 |
| `Cannot access 'AuthModule' before initialization` | 模块循环 import，装饰器求值时类还没初始化 | 两边 `forwardRef(() => X)`；更好的做法是拆出第三个模块或改用事件解耦 |
| 构造器注入的是 `undefined` 或整个 provider 解析失败，但类型检查通过 | 参数类型是 interface / `import type`，`design:paramtypes` 退化成 `Object` | 换字符串 token + `@Inject("TOKEN")`，或注入 class |
| `Error [ERR_MODULE_NOT_FOUND]: Cannot find module './app.module'` | ESM 下相对 import 必须带 `.js`（本仓库每个 import 都写 `.js`） | 全量补 `.js`；对照 [app.module.ts](../code/shop-api/src/app.module.ts) 的写法 |
| 编译报 **TS1479**，说 `@nestjs/core` 是 ESM 而当前文件是 CJS | NestJS 12 的包是 ESM-only，`shop-api/package.json` 必须 `"type": "module"` | 用 ESM；别退回 `moduleResolution: node` |
| `require is not defined` / `__dirname` 不存在 | ESM 里没有这两个全局 | `import.meta.url` + `fileURLToPath` |
| 全局守卫把新加的 `/actuator/xxx` 也拦了 | 默认拒绝：没写 `@Public()` 就受保护 | 补 `@Public()`；行为与 Spring 的 `anyRequest().authenticated()` 一致 |
| 单元测试能跑，`pnpm test` 起 Nest 时报缺 provider | 测试容器不会自动带 `@Global()` 之外的模块 | 在 `TestingModule` 里显式列出或 `overrideProvider` |
| 单例里 `Map` 的数据莫名少一半 | 多进程部署（`cluster`/PM2），每个 worker 一份实例 | 状态外置到 Redis；或接受「进程级统计」语义（`Metrics` 就是后者） |

关于循环依赖补一句架构判断：Spring 默认**禁止**构造器循环依赖，逼你重画边界；Nest 给了 `forwardRef` 这条逃生绳，所以它会容忍你把模块写成环。对架构师来说，`forwardRef` 出现一次就应当作设计评审信号，而不是「加上就能跑」。

## 10. 本章自测

1. `HealthModule` 没有 import `CommonModule`，`ActuatorController` 却注入了 `Metrics`。请说出两条让它成立的其他写法（不许用 `@Global()`）。
2. 把 `DemoDataSeeder` 从 `OnApplicationBootstrap` 改成构造器里直接 seed，会有什么后果？（提示：`ProductRepository`、`ConfigService`、建表时机）
3. 有人写了 `@Injectable({ scope: Scope.REQUEST })` 的 `OrderService`，压测时 QPS 掉了 8 倍。请解释机制。

<details>
<summary>参考答案</summary>

1. ① `CommonModule` 的 `providers/exports: [Metrics]` 之外，让 `HealthModule` 直接 `imports: [CommonModule]`（`Metrics` 已被导出）；② 把 `{ provide: Metrics, useValue: fakeMetrics }` 之类挂进 `HealthModule` 自己的 providers（测试里就是这么做的，见 [order.service.spec.ts](../code/shop-api/src/order/order.service.spec.ts)）。
2. 构造器执行时 `ConfigService` 已注入、可用，但 `DatabaseService` 的建表发生在它自己的构造器里——顺序仍然安全。真正的问题是**失败面**：seed 逻辑抛错会让整个容器实例化失败（连健康检查端点都起不来），而 `onApplicationBootstrap` 在初始化之后运行，语义上更接近「应用已就绪，做启动后动作」，也和 Java 的 `ApplicationRunner` 对齐。另外构造器里做 IO 会让单元测试无法绕开（`new ProductRepository({db} as ...)` 这种轻量测法就废了）。
3. `OrderService` 变 REQUEST scope 后，Nest 会把**依赖它的链**一并升级：`OrderController` 每请求重建，`OrderRepository`、`Metrics`、`ConfigService`、以及 `DatabaseService` 都会按请求解析/构造。持有连接与密码摘要这类重对象的构造被放大到每请求一次，GC 压力和构造成本同时上升。请求级数据应该挂在 `request` 上（`request.user`、`request.requestId`），配合 `createParamDecorator` 读取。
</details>
