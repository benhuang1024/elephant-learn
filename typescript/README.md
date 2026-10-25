# TypeScript + NestJS 全栈速成：写给 10 年 PHP 架构师

> 目标读者：精通 PHP / Laravel（或 Symfony），做过架构设计，想在 **3～4 周** 内能读懂、评审、设计
> TypeScript 全栈项目（后端 NestJS + 前端 React / Vue / Next.js）。
> 技术栈：**Node.js 24 + pnpm 9 + TypeScript 7.0.2（Go 原生编译器）+ NestJS 12.2 + Drizzle 0.45 + Vitest 5 + React 19 / Vue 3.5 / Next.js 16**。

这不是一本从 `Hello World` 讲起的教程。每一章都遵循同一个套路：

```
PHP/Laravel 的写法  →  TypeScript 的写法  →  关键差异与坑
```

你已经懂的东西（HTTP、REST、ORM、依赖注入、事务、缓存、队列）只做映射；
真正花时间的是 **PHP 人的直觉会失效的地方**：常驻进程与事件循环、类型擦除后的运行时校验、
ESM/CJS 双栈与工具链跟不上 TS 7 的现实、结构化类型带来的「名义缺失」。

业务域与 [java/code/shop-api](../java/code/shop-api) 完全一致（商品 + 订单、同样的接口、同样的演示账号、
库存不足 409 problem+json、乐观锁），所以三套语言可以横向对比同一件事。

## 目录结构

```
typescript/
├── README.md                    # 本文件
├── docs/                        # 00～16 章 + 附录速查表
└── code/                        # pnpm workspace（8 个包）
    ├── lang-basics/             # 纯 TS：每主题一个文件 + 一个测试 = 可执行笔记
    ├── packages/shared/         # @shop/shared：Zod schema + 推导类型（一处定义、四端复用）
    ├── shop-api/                # NestJS 12 + Drizzle + SQLite：与 Java 版同一套接口
    ├── web-react/               # Vite + React 19 + TanStack Query 5
    ├── web-vue/                 # Vite + Vue 3.5 + Pinia
    ├── web-next/                # Next.js 16 App Router：SSR 列表 + Server Action 下单
    └── tools/eslint-config/     # 共享 ESLint 扁平配置（锁 TS 6，见「工具链现实」）
```

`code/` 是一个 pnpm workspace；所有命令都在 `typescript/code/` 下执行。

## 环境准备

```bash
# Node 24（本机 v24.21.0）；用 corepack 固定 pnpm 版本，避免 lockfile 漂移
corepack enable
corepack prepare pnpm@9.15.9 --activate
node --version    # v24.x
pnpm --version    # 9.15.9
```

```bash
cd typescript/code
pnpm install      # 首次约 50s
```

> **不需要**全局安装 TypeScript、Vitest、ESLint：每个包在自己的 `devDependencies` 里声明版本，
> 这是与「php 全局 + composer 本地」混合习惯最不一样的地方。

### 工具链现实：TS 7 与 TS 6 并存

TypeScript 7（`tsc` 是 Go 原生编译器）已经发布，但生态只跟上了一半。本仓库的真实状态：

| 工具 | 版本 | 对 TS 7 的支持 | 本仓库的处理 |
|---|---|---|---|
| `tsc`（类型检查/构建） | 7.0.2 | 本体 | 全部用它 |
| NestJS 装饰器元数据 | 12.2.0 | ✅ 支持 `emitDecoratorMetadata`（实测生成 `__metadata("design:paramtypes", [...])`） | 无需 SWC，直接 `tsc` 编译 |
| typescript-eslint | 8.72.0 | ❌ 加载即抛 `typescript-eslint does not support TS 7.0` | `tools/eslint-config` 内锁 `typescript@6.0.3` |
| vue-tsc | 3.3.13 | ❌ `require.resolve("typescript/lib/tsc")` 在 TS 7 里已不存在 | `web-vue` 内锁 `typescript@6.0.3` |
| Vitest / esbuild / rolldown / Turbopack | 5.0.5 / – | ✅ 只做转译，不读类型 | 无影响 |

也就是说：**类型检查用 TS 7，linter 和 Vue 模板检查借用 TS 6 的 JS 编译器 API**。第 04 章详述原因与代价。

## 快速开始

### 1. lang-basics：语言与运行时（可执行笔记）

```bash
cd typescript/code
pnpm --filter @ts/lang-basics test      # 12 个测试文件、80 个用例
node lang-basics/scripts/hello.ts       # Node 24 原生跑 TS，不需要 ts-node/tsx
```

每个主题一个源文件 + 一个测试文件（测试里含 `expectTypeOf` 类型断言）：

| 主题 | 代码 | 测试 |
|---|---|---|
| 值与类型、字面量类型、number 的坑 | [values-and-types.ts](code/lang-basics/src/values-and-types.ts) | [测试](code/lang-basics/test/values-and-types.test.ts) |
| 结构化类型 vs 名义类型 | [structural-typing.ts](code/lang-basics/src/structural-typing.ts) | [测试](code/lang-basics/test/structural-typing.test.ts) |
| 泛型与约束、Collection | [generics.ts](code/lang-basics/src/generics.ts) | [测试](code/lang-basics/test/generics.test.ts) |
| 联合收窄、可辨识联合（≈ sealed） | [narrowing-and-unions.ts](code/lang-basics/src/narrowing-and-unions.ts) | [测试](code/lang-basics/test/narrowing-and-unions.test.ts) |
| null/undefined、可选链、?? | [null-safety.ts](code/lang-basics/src/null-safety.ts) | [测试](code/lang-basics/test/null-safety.test.ts) |
| 金额值对象（整数分） | [money.ts](code/lang-basics/src/money.ts) | [测试](code/lang-basics/test/money.test.ts) |
| enum vs 字面量联合 | [enum-vs-union.ts](code/lang-basics/src/enum-vs-union.ts) | [测试](code/lang-basics/test/enum-vs-union.test.ts) |
| 事件循环、微任务、并发上限 | [async-event-loop.ts](code/lang-basics/src/async-event-loop.ts) | [测试](code/lang-basics/test/async-event-loop.test.ts) |
| 异常层级与 Result 类型 | [error-handling.ts](code/lang-basics/src/error-handling.ts) | [测试](code/lang-basics/test/error-handling.test.ts) |
| 数组函数（array_map 对照） | [array-functions.ts](code/lang-basics/src/array-functions.ts) | [测试](code/lang-basics/test/array-functions.test.ts) |
| 工具类型 | [utility-types.ts](code/lang-basics/src/utility-types.ts) | [测试](code/lang-basics/test/utility-types.test.ts) |
| branded type（强类型 id） | [branded-ids.ts](code/lang-basics/src/branded-ids.ts) | [测试](code/lang-basics/test/branded-ids.test.ts) |
| 单文件脚本 | [scripts/hello.ts](code/lang-basics/scripts/hello.ts) | `node lang-basics/scripts/hello.ts` |

### 2. @shop/shared：契约只写一次

```bash
pnpm --filter @shop/shared test     # 19 个用例：定点小数、schema、problem+json 形状
pnpm --filter @shop/shared build    # 产出 dist/（ESM + .d.ts）
```

[decimal.ts](code/packages/shared/src/decimal.ts) 用品牌字符串 `DecimalAmount`（`"599.00"`）+ 整数分运算
解决「JS 没有 BigDecimal」；[problem.ts](code/packages/shared/src/problem.ts) 定义与 Java 版逐字段一致的
错误载荷；[product.ts](code/packages/shared/src/product.ts) / [order.ts](code/packages/shared/src/order.ts)
是 DTO 契约，服务端校验和前端解析共用同一份 schema。

### 3. shop-api：NestJS 应用

默认 SQLite 文件库，启动即建表并插入 3 件演示商品：

```bash
cd typescript/code/shop-api
pnpm dev                    # = pnpm build && node dist/main.js，监听 8080
```

另开一个终端（curl 走查，与 [java/README.md](../java/README.md) 的走查逐条对应）：

```bash
# 公开查询
curl -s localhost:8080/api/products

# 搜索
curl -s 'localhost:8080/api/products?q=键盘'

# 未认证写入 → 401 + WWW-Authenticate: Basic realm="Realm"
curl -i -X POST localhost:8080/api/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-100","name":"显示器","price":1999.00,"stock":3}'

# HTTP Basic 认证后下单 → 201 + Location，库存 20 → 18，version 0 → 1
curl -i -u customer:customer123 -X POST localhost:8080/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"ben","items":[{"productId":1,"quantity":2}]}'

# 库存不足 → 409 application/problem+json
curl -i -u customer:customer123 -X POST localhost:8080/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"ben","items":[{"productId":3,"quantity":3}]}'

# ADMIN 才能删除 → customer 403、admin 204
curl -i -u customer:customer123 -X DELETE localhost:8080/api/products/1
curl -i -u admin:admin123       -X DELETE localhost:8080/api/products/1

# 健康检查 / 运维端点（metrics 需要认证）
curl -s localhost:8080/actuator/health
curl -s -u admin:admin123 localhost:8080/actuator/metrics
```

演示账号（与 Java 版一致）：

| 用户 | 密码 | 角色 | 权限 |
|---|---|---|---|
| `admin` | `admin123` | ADMIN | 增删改查；`DELETE` 仅 ADMIN |
| `customer` | `customer123` | CUSTOMER | 下单、查询订单 |

主要接口：

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/products?q=键盘` | 否 | 商品列表/搜索（按名称排序，大小写不敏感） |
| GET | `/api/products/{id}` | 否 | 商品详情 |
| POST | `/api/products` | 是 | 创建商品（重复 SKU → 409） |
| PUT | `/api/products/{id}` | 是 | 修改商品（乐观锁） |
| DELETE | `/api/products/{id}` | ADMIN | 删除商品（被订单引用 → 409） |
| POST | `/api/orders` | 是 | 下单（事务扣库存） |
| GET | `/api/orders/{id}` | 是 | 订单详情 |
| GET | `/api/orders` | 是 | 订单列表（按创建时间倒序） |
| GET | `/actuator/health` `/actuator/info` | 否 | 运维端点 |
| GET | `/actuator/metrics` | 是 | `@Timed` 计数器快照 |

环境变量见 [.env.example](code/shop-api/.env.example)，全部由
[config/env.ts](code/shop-api/src/config/env.ts) 的 Zod schema 校验，写错直接启动失败。

### 4. 三个前端

| 工程 | 技术 | 端口 | 启动 | 数据通路 |
|---|---|---|---|---|
| [web-react](code/web-react) | React 19 + Vite 8 + TanStack Query 5 | 3000 | `pnpm --filter @shop/web-react dev` | dev proxy `/api` → 8080 |
| [web-vue](code/web-vue) | Vue 3.5 + Pinia 4 + Vite 8 | 3010 | `pnpm --filter @shop/web-vue dev` | dev proxy `/api` → 8080 |
| [web-next](code/web-next) | Next.js 16 App Router（Turbopack） | 3100 | `pnpm --filter @shop/web-next dev` | 服务端直接 fetch 8080 |

三者都从 `@shop/shared` 导入 schema 与类型：列表、下单、错误展示用的是同一份契约。
后端（和 Java 版一样）**没有开 CORS**，所以浏览器版走同源代理，这也是 Next 服务端 fetch 不需要代理的原因。

### 5. 全量检查

```bash
cd typescript/code
pnpm -r typecheck    # tsc（web-vue 用 vue-tsc）
pnpm -r lint         # eslint 10 扁平配置
pnpm -r test         # vitest（含 shop-api 单元测试）
pnpm --filter @shop/api test:e2e   # supertest 全链路
pnpm -r build        # shared + Nest dist + 三个前端产物
```

## 验证记录（2026-10-25）

本机：Node v24.21.0、pnpm 9.15.9、macOS arm64。

| 命令 | 结果 |
|---|---|
| `pnpm install` | 8 个 workspace 项目，约 50s，better-sqlite3 原生模块预编译可用 |
| `pnpm -r typecheck` | 全部通过（lang-basics / shared / shop-api / web-react / web-vue(vue-tsc) / web-next） |
| `pnpm -r lint` | 全部通过（0 error 0 warning） |
| `pnpm -r test` | **127 个用例全绿**：lang-basics 80、shared 19、shop-api 单元 17、web-react 4、web-vue 3、web-next 4 |
| `pnpm --filter @shop/api test:e2e` | 17 个用例全绿（连跑两次结果一致，内存库不落盘） |
| `pnpm --filter @shop/api db:generate` | drizzle-kit 读取 3 张表并生成 `shop-api/drizzle/0000_*.sql`（迁移目录由这次运行产出，运行期仍走 `SCHEMA_SQL`） |
| `pnpm -r build` | shared `dist/`（116 KB）、shop-api `dist/`、web-react `dist/`（入口 JS 349.74 kB / gzip 105.91 kB）、web-vue `dist/`（166.23 kB / gzip 55.77 kB）、web-next 构建成功（`ƒ /` 动态路由）。本轮**没有**触发 Vite 的 500 kB 分包警告（shared 还是 CJS 时会） |
| 启动 `node dist/main.js` 后 curl 走查 | 见下表 |
| 内置浏览器实测三个前端 | 见下表 |
| Markdown 相对链接检查 | 见下表 |
| `node lang-basics/scripts/hello.ts` | 输出 `你好, PHPer! 当前 Node v24.21.0，正在学 TypeScript` |

curl 走查（与 Java 版逐条对照）：

| 请求 | 结果 |
|---|---|
| `GET /api/products` | `200`，3 件演示商品，带 `X-Request-Id` 与 `X-Elapsed-Ms` |
| `GET /api/products?q=键盘` | `200`，只返回「机械键盘」；`q=` 空白视为不过滤 |
| `GET /api/products/9999` | `404` `application/problem+json`：`{"title":"资源不存在","status":404,"detail":"商品 不存在: 9999"}` |
| `POST /api/products`（无认证，`Accept: */*`） | `401` + `WWW-Authenticate: Basic realm="Realm"` + `{"timestamp","status":401,"error":"Unauthorized","path"}` |
| `POST /api/products`（无认证，`Accept: application/json`） | `401`，**空 body、无 WWW-Authenticate**（复刻 Spring Security 的 Accept 分支） |
| `POST /api/orders`（customer，库存充足） | `201` + `Location: /api/orders/1`，`total` 1198，库存 `20 → 18`，`version` `0 → 1` |
| `POST /api/orders`（库存不足） | `409`，`{"title":"库存不足","status":409,"detail":"库存不足 sku=SKU-003 需要=3 剩余=2","sku":"SKU-003","requested":3,"available":2}` |
| `POST /api/orders`（`items:[]` / `quantity:100`） | `400`，`errors` 为「字段 → 第一条消息」，嵌套路径 `items[0].quantity` |
| `POST /api/products`（重复 SKU） | `409` `{"title":"业务冲突","detail":"SKU 已存在: SKU-001"}` |
| `DELETE /api/products/{id}` | customer → `403`；admin → `204` 空 body；再次删除 → `404` |
| `GET /actuator/health` | `200` `{"status":"UP","components":{"db":{"status":"UP","details":{"database":"SQLite","file":"..."}},"memory":{...},"ping":{"status":"UP"}}}` |
| `GET /actuator/metrics` | 未认证 `401`；带认证 `200`，含 `OrderService.place` 计数 |
| 传入 `X-Request-Id: trace-from-gateway-1` | 响应头原样回显（复用而非重新生成） |

浏览器实测（三个前端各自点「选择 → 提交订单」；下面这轮是在 `@shop/shared` 切成 ESM、`verbatimModuleSyntax` 回归 base 之后重跑的，用的是全新 SQLite 文件 `/tmp/shop-browser.db`）：

| 工程 | 结果 |
|---|---|
| web-react:3000 | 列表渲染 3 件（`SKU-001` 库存 20）；点「选择 → 提交订单」显示「下单成功：订单 #1，合计 ¥599.00，状态 PENDING」，`invalidateQueries` 后列表自动刷新为 `库存 19`、`version 1` |
| web-vue:3010 | 选中 `SKU-002` 后 Pinia 小计 ¥1,299.00（`multiplyDecimalByInt` 来自共享包）；下单 → 最近订单区「#2 · ben · ¥1,299.00 · PENDING」含订单行，列表 `库存 5→4`、`version 1` |
| web-next:3100 | SSR HTML 已含商品（无客户端 fetch）。**先测失败分支**：选 `SKU-003` 数量 5 → 页面显示「库存不足（HTTP 409）：库存不足 sku=SKU-003 需要=5 剩余=2」且列表不变；再数量 1 → 「下单成功：订单 #3，合计 ¥399.00」，`revalidatePath` 后服务端重渲染为 `库存 2→1`、`version 2` |

> 截图未产出：内置浏览器面板当前不可见（`viewport=0x0`，`visibilityState=hidden`），
> 截图接口直接返回不可用；因此以上结论来自同一页面的 DOM 断言与文本抓取，而非图像。

Markdown 链接检查（临时脚本，遍历 `typescript/**/*.md` 的相对链接并检查目标文件是否存在）：**20 个 md 文件、812 条相对链接、0 条失效**。
校验范围是「文件是否存在」，不含锚点（`#节标题`）与跨仓库链接的可达性。

### 与 Java 版的已知差异（不是 bug，是平台差异）

| 项目 | java/shop-api | typescript/shop-api | 说明 |
|---|---|---|---|
| 金额 JSON | `599.00`（BigDecimal 带 scale） | `599`（JS number 无 scale） | 内部仍是 `"599.00"` 定点字符串 + 整数分运算；只有出口做了 `Number()`。第 03/07 章详解 |
| `createdAt` | `2026-10-25T09:33:41.123456`（秒为 0 时省略 `:SS`） | `2026-10-25T10:05:49.216`（固定 3 位毫秒） | 都是本地时间无时区后缀 |
| 乐观锁触发方式 | Hibernate 在 commit 时自动加 `WHERE version=?` | 手写 `WHERE id=? AND version=?`，`changes===0` 抛错 | 语义一致，第 08 章对照 |
| 409 并发冲突的可达性 | 两个请求可真正并发 → 可复现 | better-sqlite3 同步事务被事件循环串行化 → HTTP 层几乎不可复现 | 冲突分支在 repository 单测里覆盖 |
| 数据库 | H2 内存库（可选 PostgreSQL profile + Flyway + Testcontainers） | SQLite 文件/内存库，启动期 `create table if not exists` | 迁移工具是 drizzle-kit，本仓库运行期未依赖它 |
| 安全 | Spring Security 过滤器链 + BCrypt | 全局 Guard + 内存账号（`sha256` 仅为了定长比较） | 演示用途；生产见第 09/15 章 |
| CORS | 未开启 | 未开启 | 前端用 dev proxy 规避 |

### 未验证项（如实列出）

- **`docker build` 未执行**：[Dockerfile](code/shop-api/Dockerfile) 是按多阶段惯例写的参考件，本机没有跑过构建，
  `pnpm fetch` / native 模块在 alpine 下的表现需要你自己验证。
- **PostgreSQL 未接入**：本仓库只有 SQLite。`drizzle.config.ts` 的 `dialect` 是 `sqlite`，
  切 Postgres 需要改 `drizzle-orm/node-postgres` + 列类型（`numeric` / `timestamp`），见第 08 章路线。
- **`pnpm db:push` 未执行**：`db:generate` 已验证（见上表），但把 schema 直接推到已存在的库这条路径没跑过。
- **可观测性缺口**：日志用 Nest 内置 `Logger`（非结构化），没有接入 pino/OpenTelemetry/Prometheus；
  `X-Request-Id` 只出现在响应头，尚未进入日志行。第 15 章列为「生产前必补」。
- **`@nestjs/swagger` / OpenAPI 未接入**：契约靠 `@shop/shared` + 契约测试保证，见第 14 章取舍。
- **前端组件级测试未做**：没有装 jsdom/@testing-library/eslint-plugin-vue，前端测试只覆盖边界逻辑（第 09/11/12 章说明）。

## 学习路线

| 章节 | 内容 | 建议用时 | 重要度 |
|---|---|---|---|
| [00 环境与工具链](docs/00-环境与工具链.md) | Node 24、corepack/pnpm、TS 7 与 TS 6 并存、四条日常命令 | 0.5 天 | ★★ |
| [01 TypeScript 语言速通](docs/01-TypeScript语言速通.md) | 类型与字面量、interface/type、class、enum vs union、null、ESM | 2 天 | ★★★★★ |
| [02 类型系统进阶](docs/02-类型系统进阶.md) | 结构化类型、泛型、收窄、可辨识联合、工具类型、satisfies、branded | 2 天 | ★★★★★ |
| [03 JS 运行时与事件循环](docs/03-JS运行时与事件循环.md) | share-nothing → 常驻单线程、微任务、并发控制、number/金额、内存 | 1.5 天 | ★★★★★ |
| [04 包管理与工程化](docs/04-包管理与工程化.md) | composer ↔ pnpm、lockfile、ESM/CJS、tsconfig 逐项、workspace、ESLint | 1 天 | ★★★★ |
| [05 运行时校验与边界](docs/05-运行时校验与边界.md) | 类型擦除、Zod、`z.infer`、环境变量、DTO 三种形态 | 1 天 | ★★★★★ |
| [06 NestJS 核心：模块与 DI](docs/06-NestJS核心-模块与DI.md) | Module/Provider ≈ 容器、装饰器与 reflect-metadata、作用域、生命周期 | 1.5 天 | ★★★★★ |
| [07 NestJS Web 与 REST](docs/07-NestJS-Web与REST.md) | Middleware→Guard→Interceptor→Pipe→Controller→Filter、problem+json | 1.5 天 | ★★★★★ |
| [08 数据访问与事务](docs/08-数据访问与事务.md) | Drizzle vs Prisma vs Eloquent、迁移、事务、乐观锁、N+1、同步驱动代价 | 2 天 | ★★★★★ |
| [09 测试](docs/09-测试.md) | Vitest、TestingModule、supertest、expectTypeOf、mock 策略 | 1 天 | ★★★★ |
| [10 前端心智模型](docs/10-前端心智模型.md) | 给后端人：构建产物、SPA/SSR/RSC、服务端状态、Blade/Inertia 映射 | 1 天 | ★★★★ |
| [11 React 与 TypeScript](docs/11-React与TypeScript.md) | props/事件/泛型组件、hooks 与闭包、TanStack Query、表单 + Zod | 1.5 天 | ★★★★ |
| [12 Vue 3 与 TypeScript](docs/12-Vue3与TypeScript.md) | `<script setup lang="ts">`、defineProps/emits、Pinia、vue-tsc | 1 天 | ★★★ |
| [13 Next.js 全栈](docs/13-Nextjs全栈.md) | App Router、Server Components、Server Actions、与 Laravel+Inertia 对比 | 1.5 天 | ★★★★ |
| [14 端到端类型共享与 Monorepo](docs/14-端到端类型共享与Monorepo.md) | shared 包、`exports` 与构建顺序、codegen 替代方案、版本治理 | 1 天 | ★★★★ |
| [15 生产化](docs/15-生产化.md) | 构建产物、Docker、cluster/PM2、日志与可观测性、优雅停机 | 1 天 | ★★★★ |
| [16 架构师视角](docs/16-架构师视角.md) | Laravel → Node 生态地图、选型边界、`any` 治理、迁移策略 | 1 天 | ★★★★★ |
| [附录 PHP → TypeScript 速查表](docs/附录-PHP到TypeScript速查表.md) | 语法 / 常用函数 / 框架概念 / 常见坑 一页对照 | 随时查 | ★★★★★ |

**最短路径**（只有 3 天）：01 → 03 → 05 → 07 → 08 → 附录。
**想做全栈**（再加 3 天）：10 → 11 → 14 → 13。

## 学习建议

1. **先把 `pnpm -r typecheck` 变成肌肉记忆**。TS 的价值 90% 来自「编译器 + linter 在保存时就把话说清楚」，
   而不是运行时。把它当 `php -l` + PHPStan level 8 的合体来用。
2. **别信「类型 = 校验」**。所有外部输入（HTTP body、环境变量、JSON 文件、URL 参数）必须过 Zod。
   第 05 章和 [shop-api 的 pipe](code/shop-api/src/common/zod.pipe.ts) 是全书最该抄走的一段。
3. **用「一个请求的生命周期」串起后端知识**：`app.use(request-id)` → `APP_GUARD`（Basic 认证）→
   `APP_INTERCEPTOR`（计时）→ `Pipe`（Zod 校验）→ Controller → Service → `db.transaction`（乐观锁扣库存）→
   返回值序列化 → 出错则 `APP_FILTER` 转 problem+json。能讲清这条链，NestJS 就算入门了。
4. **对照着读三套代码**：`java/code/shop-api` 与 `typescript/code/shop-api` 的接口、错误载荷、演示数据完全一致，
   差异只可能来自语言/框架本身——这正是最有信息量的地方（见上文差异表）。
5. **升级工具链前先查兼容性**。本仓库 TS 7 与 typescript-eslint / vue-tsc 的并存状态就是活教材：
   大版本升级要按「类型检查器 → linter → 框架 CLI → 测试器」的顺序推进，并在 CI 里同时锁 `packageManager`。
