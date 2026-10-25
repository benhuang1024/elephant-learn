# 14 端到端类型共享与 Monorepo

> **配套代码（共享包 + workspace 治理）**
> 契约：[packages/shared/src/index.ts](../code/packages/shared/src/index.ts)、[decimal.ts](../code/packages/shared/src/decimal.ts)、[product.ts](../code/packages/shared/src/product.ts)、[order.ts](../code/packages/shared/src/order.ts)、[problem.ts](../code/packages/shared/src/problem.ts)、[field-errors.ts](../code/packages/shared/src/field-errors.ts)、[time.ts](../code/packages/shared/src/time.ts)
> 包定义与编译：[packages/shared/package.json](../code/packages/shared/package.json)、[tsconfig.json](../code/packages/shared/tsconfig.json)、[tsconfig.build.json](../code/packages/shared/tsconfig.build.json)
> workspace：[pnpm-workspace.yaml](../code/pnpm-workspace.yaml)、[code/package.json](../code/package.json)、[tsconfig.base.json](../code/tsconfig.base.json)
> 工具包：[tools/eslint-config/package.json](../code/tools/eslint-config/package.json)、[index.mjs](../code/tools/eslint-config/index.mjs)
> 四个消费方：[shop-api/src/common/zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts)、[shop-api/src/product/product.repository.ts](../code/shop-api/src/product/product.repository.ts)、[web-react/src/api.ts](../code/web-react/src/api.ts)、[web-vue/src/stores/catalog.ts](../code/web-vue/src/stores/catalog.ts)、[web-next/src/lib/api.ts](../code/web-next/src/lib/api.ts)
> 前置：第 04 章讲工具链本身（composer↔pnpm、`pnpm -r`、tsconfig 选项、ESM/CJS 双栈）。本章只讲**共享契约的工程化**：怎么切包、怎么定 DTO、有哪些替代方案、代价在哪。

## 1. 一句话结论：类型不是契约，schema 才是

[index.ts](../code/packages/shared/src/index.ts) 的注释就是全章纲领：

> 关键约定：**类型不是契约，schema 才是**。所以这个包的出口同时给值（schema）和类型（`z.infer`）。

PHP 老兵的直觉是「有 `declare(strict_types=1)` 就够了」。区别在于：PHP 的类型在**运行时有约束力**（传错参数直接 TypeError），TS 的类型编译后**完全不存在**。所以只共享 `interface` 等于什么都没共享——线上 JSON 多个字段、少个字段、类型不对，编译器一无所知。共享包必须同时导出**能在运行时拒绝脏数据的值**和**从它推导出的类型**：

```ts
export const ProductResponseSchema = z.object({ id: z.int(), sku: z.string(), name: z.string(),
  price: PositiveAmountSchema, stock: z.int(), version: z.int() });
export type ProductResponse = z.infer<typeof ProductResponseSchema>;
```

这一句在四个地方各自兑现：后端用它校验入参、前端用它校验响应、单测用它构造 fixture（第 12 章的 `ProductResponseSchema.parse({ price: 599 })`）、IDE 用它做补全。**改一次，四处同时红或同时绿**——这就是 monorepo 的全部动机。

## 2. monorepo 工具选择：为什么只要 pnpm

| 工具 | 解决什么 | 什么时候才需要 | 本仓库 |
|---|---|---|---|
| **pnpm workspace** | 依赖解析/安装（多包一个 lockfile、硬链接 store、`workspace:*`） | 只要有 ≥2 个包 | ✅ 用它就够（`packageManager: pnpm@9.15.9`） |
| Turborepo | **任务编排 + 远端缓存**：`turbo build` 跳过未变更子图 | 包多到大仓「全量 build 要 5 分钟」；CI 要复用产物 | ❌ 7 个包，全量 build 秒级，加了只是多一个依赖 |
| Nx | 上面两条 + **生成器/依赖图可视化/影响分析/project graph** + 框架插件 | 十几到上百包、多团队、要 affected 命令与迁移脚本 | ❌ 引入 learning cost 与配置面，收益不划算 |
| Lerna / Cargo workspace / Bazel | 老一代发布工具 / 语言原生 workspace / 多语言超大规模 | 维护 legacy，或仓库跨多种语言 | ❌ |

判据很简单：**先只上 workspace，等「构建时间」或「影响面分析」真的疼了再上编排工具**。pnpm 已经给了拓扑排序（同一脚本名跨包按依赖顺序），而本仓库的构建顺序问题用一行脚本前缀就解决了（第 4 节）——疼点还没出现。

对照 PHP：这相当于「一个 composer 项目里有 `packages/shared`」，用 `path repository` + `symlink` 就够了；`composer work`/`monorepo-tools` 那类工具只在包数量级上去之后才回本。

## 3. `workspace:*` 与版本治理

[pnpm-workspace.yaml](../code/pnpm-workspace.yaml) 一共 7 个成员：

```yaml
packages:
  - lang-basics
  - packages/*
  - shop-api
  - tools/*
  - web-react
  - web-vue
  - web-next
```

消费方声明依赖时**必须**用协议前缀：

```json
"dependencies": { "@shop/shared": "workspace:*" }
```

| 写法 | 语义 | 事故形态 |
|---|---|---|
| `"workspace:*"` | 解析到本地包；发布/打包时替换成实际版本 | ✅ 本仓库用法 |
| `"workspace:^"` | 替换成 `^1.0.0`，允许下游升级到兼容版本 | 私有包无所谓，发布库要选它 |
| `"*"` | **会去 registry 找一个叫 `@shop/shared` 的包** | 经典事故：装到陌生人的同名包 |
| `"^1.0.0"` | 只走 registry，本地包被忽略 | 改了源码没生效，因为跑的是 registry 版本 |

对照 composer：

| composer | pnpm workspace |
|---|---|
| `"url": "file:../packages/shared"` + `"options": {"symlink": true}` | `"@shop/shared": "workspace:*"`（symlink 是默认，无需配置） |
| `path repository` 段要写在根 `composer.json` | 只有 `pnpm-workspace.yaml` 的 glob |
| `composer install` 后 `vendor/shared` 是符号链接 | `node_modules/@shop/shared` 是符号链接，指向 `packages/shared` |
| 版本约束靠 `^1.0`，本地与线上是同一套语义 | `workspace:*` 把「本地开发」与「发布版本」显式分开，避免本地路径混进 lockfile |
| `composer update --with-all-dependencies` | `pnpm update -r` / `pnpm dedupe` |
| autoload（PSR-4 命名空间→目录） | `package.json` 的 `exports`/`main`/`types`（第 5 节） |

**版本治理现状**：全仓 `private: true`、没有发布流程，所以 `workspace:*` 的替换语义其实用不上；真正重要的是「**四端不可能装到不同版本的契约**」——lockfile 里 `@shop/shared` 只有一条。这也是 monorepo 对「多仓库 + 版本矩阵地狱」（Laravel 生态里 `illuminate/*` 版本打架那种）最根本的解药。

## 4. 构建顺序：`pnpm -r` 的拓扑与那一行前缀

`pnpm -r build` 确实按拓扑顺序跑，但它排的是**同名脚本**：跑各包的 `build` 时，`@shop/shared` 的 `build` 排在前面。问题出在 `typecheck` 这个脚本名上——`pnpm -r typecheck` 会跑 shared 的 `typecheck`（`tsc --noEmit`，**什么都不产出**），而下游需要的是 shared 的 `dist/`。拓扑顺序帮不了跨脚本名的依赖。

所以每个下游包的脚本都自带一句引导（真实内容，非示意）：

| 包 | `typecheck` | `build` |
|---|---|---|
| `@shop/shared` | `tsc --noEmit` | `tsc -p tsconfig.build.json` |
| `@shop/api` | `pnpm --filter @shop/shared build && tsc --noEmit` | `pnpm --filter @shop/shared build && tsc -p tsconfig.build.json` |
| `@shop/web-react` | `pnpm --filter @shop/shared build && tsc --noEmit` | `pnpm --filter @shop/shared build && tsc --noEmit && vite build` |
| `@shop/web-vue` | `pnpm --filter @shop/shared build && vue-tsc --noEmit` | `pnpm --filter @shop/shared build && vue-tsc --noEmit && vite build` |
| `@shop/web-next` | `pnpm --filter @shop/shared build && tsc --noEmit` | `pnpm --filter @shop/shared build && next build` |

三行观察：

1. **啰嗦但诚实**。它把「依赖必须先编译」这条隐式契约写在显式位置，等价于 Maven 多模块里先 `install` domain 模块。第 04 章 §5 把这条列成「本仓库最实用的一条」，我同意。
2. **npm lifecycle 钩子帮不上忙**。`prepare` / `prepublishOnly` 这类脚本是给「发布包」用的：`prepare` 在 `npm install`（无参）时跑、`prepublishOnly` 只在 publish 前跑；私有 workspace 包既不 publish，`install` 也不会逐包触发它们。想让「装完就有 dist」，pnpm 生态里更对味的是把 `postinstall` 放根上跑一次全量构建——但那就从「显式」滑回「隐式」了。本仓库选择把前缀写全。
3. **web-vue 那一列还额外说明**：`vue-tsc` 插在 `vite build` 前面（第 12 章）。「类型不过 → 不打生产包」是所有四个包共同的顺序约定。

## 5. `exports` / `types` 条件解析：shared 为什么最终必须是 ESM

[packages/shared/package.json](../code/packages/shared/package.json)（真实内容）：

```json
{
  "name": "@shop/shared",
  "private": true,
  "type": "module",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist"]
}
```

**这个包曾经是全仓唯一没有 `"type"` 字段、唯一带 `main` 的包**——故意编成 CommonJS。理由当时看起来很强：契约的四个消费方解析能力不一样，而 CJS 是唯一「所有人都能吃」的产物形态（ESM 可以 import CJS，反过来不行）。后端、单测、e2e 确实全绿。**直到在浏览器里打开前端**：页面一片空白，实际错误是

```
The requested module '/@fs/.../packages/shared/dist/index.js'
does not provide an export named 'OrderResponseSchema'
```

根因（第 04 章 §5 有完整现场与修法）：workspace 的**链接依赖**（symlink 到本仓库目录）被 Vite 当作源码用 `/@fs/` 直接送进浏览器，**不走 `optimizeDeps` 的 CJS→ESM 预打包**，于是浏览器按 ESM 规则去读一个 CJS 文件，具名导出根本不存在。Node 侧能跑是因为 Nest 走的是 CJS 兼容路径，两边机制不同。

教训值得单独记一行：**「Node 能 import CJS」不等于「所有工具链都能吃 CJS 产物」。** 打包器对 `node_modules` 里的依赖做预打包，对 workspace 链接的本地包不做——这恰好是 monorepo 共享包最常见的落点。

现在四个消费方吃的是同一份 ESM 产物：

| 消费方 | 运行时/工具 | 怎么吃 |
|---|---|---|
| `@shop/api`（NestJS 12） | Node 24 ESM（`"type": "module"`） | 原生 ESM import，具名导出直接可用；与 Nest 的 ESM-only 方向一致 |
| `@shop/web-react` / `web-vue` | Vite 8（rolldown） | `/@fs/` 直引也成立，因为文件本身就是 ESM |
| `@shop/web-next` | Next 16 + Turbopack | 服务端与客户端图都按 ESM 解析 |

另一条方向相反的硬约束仍然成立，而且是 `shop-api` 被迫写 `"type": "module"` 的原因：**CJS 不能 `import` ESM-only 包**（只能 `await import()`）。NestJS 12 全家族是 ESM-only，所以「谁消费谁做适配」在 Node 里是单向的——这个仓库里两处适配（shared、shop-api）都付了同一个方向的代价。

字段职责别记混：

| 字段 | 读取者 | 作用 |
|---|---|---|
| `exports` | Node ≥12.7、现代打包器 | **条件解析**，且会屏蔽未声明的子路径（`@shop/shared/src/decimal` 直接报错） |
| `exports["."].types` | TypeScript | 类型入口；**必须写在 `default` 前面**，顺序错了 TS 会拿到 JS |
| `exports["."].import` / `require` | Node | 双格式包才需要（`"./dist/esm/index.mjs"` + `"./dist/cjs/index.cjs"`） |
| `main` | 老解析器 / 兜底 | 只认 CJS 的工具链（部分 bundler、`ts-node` 老配置）还需要它——**本包改 ESM 后已删掉**，留着反而会诱导老工具按 CJS 解析 |
| `types`（顶层） | TS（老路径） | 双保险 |
| `files` | 发布 | 只带 `dist`，防止 `src` 意外外泄 |
| `"type": "module"` | Node | 本包的 `.js` 一律按 ESM 解释（改之前没有这一行，`dist/*.js` 就被当作 CJS） |

**产物形态实测**：`dist/*.d.ts` + `*.d.ts.map` + `*.js` + `*.js.map`，`dist/` 约 116 KB（`src/` 只有 416 行 TS）。`declarationMap: true` 不是装饰——它让「跳到定义」从前端代码一路跳进 `src/*.ts` 而不是停在生成的 `.d.ts`。四处复用的手感全靠这一行。

**改 ESM 顺带解掉的一个开关例外**：CJS 时期 [tsconfig.json](../code/packages/shared/tsconfig.json) 必须写 `verbatimModuleSyntax: false`，否则顶层值导出直接报

```
TS1287: A top-level 'export' modifier cannot be used on value declarations
        in a CommonJS module when 'verbatimModuleSyntax' is enabled.
```

也就是「CJS 包里只许 `export type`」——一个契约库当然接受不了。现在 shared 是 ESM，这一行已经删掉，原样继承 [tsconfig.base.json](../code/tsconfig.base.json) 的 `true`；全仓只剩 `shop-api` 一个例外（`emitDecoratorMetadata` 需要构造器参数的类型引用作为值活到产物里，第 11 章 §9）。判别一个包实际是什么格式，一条命令就够：`grep -l '"use strict"' packages/shared/dist/*.js` —— 有输出就是 CJS 产物，本仓库现在是空输出。

另一处结构值得抄：**类型检查与产出分成两个 tsconfig**。`tsconfig.json` 覆盖 `src` + `test`、`noEmit: true`；`tsconfig.build.json` 只含 `src`、打开 `rootDir/outDir/declaration/declarationMap`。合一个配置写会撞 `TS6059: File '.../test/decimal.test.ts' is not under 'rootDir'`（第 04 章 §6 有完整来龙去脉）。

## 6. 两条「一处定义」技术路线：project references vs 编译产物

| 维度 | A. 源码直引（`exports` 指 `src/index.ts`） | B. 编译产物（本仓库：指 `dist/`） |
|---|---|---|
| 改了 shared 要不要先 build | 不用，立刻生效 | 要（所以有第 4 节那行前缀） |
| 打包器要求 | 必须能吃 TS 源码（Vite/Next/turbopack 都行） | 无要求，最保守 |
| 只吃 JS 的老工具 | 直接崩（Node 不吃 `.ts`） | ✅ 只要产物是它能懂的格式（本仓库现在统一 ESM） |
| 产物一致性 | 每个消费方各自编译一次（可能不同 target/lib） | **一次编译，处处同一份 JS** |
| 调试/断点 | 落到源码 | 靠 `declarationMap`/`sourceMap` 映射回源码 |
| 增量正确性 | 靠打包器的 watch 图 | 靠 `dist` mtime + `tsbuildinfo` |
| 发布包 | 不可（`files` 里没有 dist 就没有内容） | ✅ 唯一现实选择 |
| 版本/CI 复杂度 | 低 | 多一层「先构建」 |

选型判据：**下游全是现代打包器 → A 更爽；有一个消费者跑在真实 Node 上（本仓库的 NestJS）→ 必须 B 或双格式。**

第三条路是 **TypeScript project references / composite**：shared 开 `composite: true` 并输出 `.tsbuildinfo`，各包 `tsconfig` 加 `"references": [{ "path": "../packages/shared" }]`，然后用 `tsc -b` 一次编译整个图——编译器自己保证构建顺序，不需要脚本前缀。

```jsonc
// packages/shared/tsconfig.json（如果走这条路）
{ "compilerOptions": { "composite": true } }
// web-vue/tsconfig.json
{ "references": [{ "path": "../packages/shared" }] }
```

代价：`tsc -b` 是**独立的一套调用方式**（跟 `pnpm -r` 脚本、Vite、`next build` 各跑各的，三处入口要统一），`composite` 会强制 `declaration`，且打包器仍然不知道这层关系（Vite 不读 references，Node 也不读）。也就是说它只解决 **TypeScript 层** 的顺序，不解决运行时解析——运行时还是得靠 `dist` 或源码直引。

本仓库为什么选 B + 脚本前缀：四个消费方里三种工具链（`tsc`、`vue-tsc`、`next build`）本来就各自独立跑，再加一个 `tsc -b` 编排层只会让「我该用哪个命令」变成第 5 种；而 `pnpm --filter @shop/shared build` 在任何调用路径下都成立，包括 CI 与 `next build` 内部。**规模再大一档（10+ 包、多契约包）我会换 A 或上 Turborepo/turbo `dependsOn: ["^build"]`，让拓扑成为工具的职责而不是一行行前缀。**

## 7. 一处定义、四端复用：收益与代价都要摊开

### 7.1 真实引用点

```ts
// shop-api：入参校验（Pipe）与 problem 生成
import { CreateProductRequestSchema, type CreateProductInput } from "@shop/shared";
@Body(new ZodValidationPipe(CreateProductRequestSchema)) input: CreateProductInput

// shop-api：仓储层写数据用共享的整数分算术
const subtotal = multiplyDecimalByInt(price, line.quantity);   // order.repository.ts
price: toWireDecimal(row.price as DecimalAmount),              // product.repository.ts

// web-vue：store 的派生小计
return multiplyDecimalByInt(product.price, quantity.value);     // → "1797.00"

// web-react / web-next：响应校验 + 金额收窄
return z.array(ProductResponseSchema).parse(await response.json());
```

| 收益 | 兑现位置 |
|---|---|
| 改契约的传播是**编译期**的 | 后端加字段 → shared 改 → 四个包同时红 |
| 业务算术只有一份实现 | 金额整数分（`decimal.ts`）后端与前端算出同一个字符串 |
| fixture 不用手搓 | 测试里 `ProductResponseSchema.parse({ price: 599 })`（第 09/12 章） |
| 错误形状统一 | `problem.ts` 的 `insufficientStockProblem()` 由服务端生成、前端 `ApiProblem` 消费 |
| 换框架不换契约 | web-react / web-vue / web-next 三份 api 层的 schema 部分完全同构 |

### 7.2 代价（讲清代价才是这章的价值）

| 代价 | 具体表现 | 缓解 |
|---|---|---|
| **bundle 体积** | `zod` 是运行时依赖，被打进三个前端；web-vue 的 `dist/assets/index-*.js` 166 kB（gzip 56 kB）里就含它（第 12 章有完整拆解） | 只共享真正跨端的 schema；按模块拆包；生产可考虑 dev-only 校验 |
| **双端重复校验** | 客户端 `PlaceOrderRequestSchema.parse(input)` 已经拦一次，服务端 `ZodValidationPipe` 又拦一次 | **不要省客户端那次**：客户端校验是 UX（少一次往返），服务端校验是安全（客户端代码归攻击者所有）。共享的意义正在于两处校验不可能规则不一致 |
| **校验时机与格式转换耦合** | `DecimalInputSchema` 用 `.transform()`，`z.infer` 拿到的是**输出**类型，`z.input` 才是**输入**类型 | 见 7.3 的三类型约定 |
| **契约包变成依赖瓶颈** | 任何 shared 改动要求四端重建；私有字段被前端顺手依赖 | `exports` 只暴露 `.`（本包已这么配），保持「后端内部形状」不外泄 |
| **schema 漂移 vs 真值来源** | shared 说 `price` 收 number，而 DB 里是定点字符串；wire 层再变一次 | 用 `toWireDecimal` 把变化点收敛到唯一一处 |

### 7.3 `z.input` / `z.infer` / DTO 三兄弟

有 `.default()` / `.transform()` 的 schema 上，「输入形状」和「输出形状」是**两个不同类型**，本仓库用命名把它们钉死：

| 导出名 | 定义 | 何时用 |
|---|---|---|
| `CreateProductRequest` | `z.input<typeof CreateProductRequestSchema>` | 前端/调用方**将要发送**的形状（`stock` 可缺省） |
| `CreateProductInput` | `z.infer<typeof CreateProductRequestSchema>` | 校验**之后**的形状（`stock` 一定是 `number`），Service/Repository 收这个 |
| `ProductResponse` | `z.infer<typeof ProductResponseSchema>` | 响应只有出向：`price` 已是 `DecimalAmount` 字符串 |

```ts
// product.ts：同一个 schema，两种类型
export type CreateProductRequest = z.input<typeof CreateProductRequestSchema>;
export type CreateProductInput = z.infer<typeof CreateProductRequestSchema>;

// order.ts：PlaceOrderRequest（发送用）/ PlaceOrderInput（服务端内部用）
export type PlaceOrderRequest = z.input<typeof PlaceOrderRequestSchema>;
export type PlaceOrderInput = z.infer<typeof PlaceOrderRequestSchema>;
```

对照 PHP：`Request`（FormRequest 的 `rules()` 输入）↔ 域内 DTO（`validated()` 之后的数组）。**TS 里这两个是两个类型，而 `interface` 只能表达一个**——这是「schema 是契约、类型是派生物」最具体的证据。用错方向的后果很实在：把 `z.input` 的类型传进 Service，`stock` 会是 `number | undefined`，编译器逼你在边界处收敛。

## 8. 与 Java 版的已知差异：`599` 不是 `599.00`

同一份语义、两种字面：

| 层 | Java/Spring | Nest/TS |
|---|---|---|
| DB 列 | `DECIMAL(12,2)` → `BigDecimal("599.00")`（**带 scale**） | SQLite 存定点字符串 `"599.00"` |
| 域内类型 | `BigDecimal` | `DecimalAmount`（品牌字符串） |
| 出口 | Jackson 按 scale 写 → JSON `599.00` | `toWireDecimal()` → `Number("599.00")` → JSON `599` |
| 前端收到 | `599.00` | `599` |

原因是 JS 的 number 是 IEEE-754 double，**数字字面量没有「几位小数」的概念**：`JSON.stringify(599.00) === "599"`，永远。这不是 bug，是语言事实；`decimal.ts` 的注释把它标成「与 Java 版的唯一可见差异」。

关键设计：差异被**关在出口一处**，前端拿到后立刻用 `PositiveAmountSchema`（`.transform()` + `normalize()` 补零）把 `599` 重新收成 `"599.00"`，所以 `product.price` 在业务代码里**始终是两位小数的字符串**，差异不外溢。[test/api.test.ts](../code/web-next/test/api.test.ts) 就是钉这个的：

```ts
const product = ProductResponseSchema.parse({ id: 3, sku: "SKU-003", name: "限量版鼠标", price: 399, stock: 2, version: 0 });
expect(product.price).toBe("399.00");   // 入站 399（number） → 出站 "399.00"（DecimalAmount）
```

如果这个差异会咬你（对账、和第三方逐字节比 JSON、签名），三条出路，按侵入性排：① 让 wire 变成字符串 `"599.00"`（改 schema，前端零成本，但要和 Java 版同步改）；② 响应序列化用自定义 replacer 输出原始数字文本（Node 里得手写 body，脏）；③ 接受差异，用本仓库的方式把变化点收敛在一处。**演示项目选 ③，真实金融系统我会选 ①。**

## 9. 要不要抽成第五个包：`@shop/api-client`

三个前端的 api 层现在是**复制关系**（`ApiProblem` 类 + `toProblem` + 凭据 + `formatAmount`，见 [web-vue/src/api.ts](../code/web-vue/src/api.ts) 与 [web-react/src/api.ts](../code/web-react/src/api.ts) 里几乎逐字相同的两处 `toProblem`）。第 12 章的注释把这个问题留给了本章，判断如下：

| 方案 | 优点 | 缺点 | 我的建议 |
|---|---|---|---|
| 保持复制 | 零协调成本；三份可以各自演化（Next 那份本来就用 `process.env`/`Buffer` 而非 `btoa`） | `ApiProblem` 语义漂移（本仓库已轻微漂移：字段名一致但 `toProblem` 实现细节不同） | 只有两份 SPA 时可行 |
| 新增 `@shop/api-client`（HTTP 层） | `ApiProblem`/problem 解析/请求封装统一，测试只写一处 | 又一处构建顺序；浏览器 API 依赖（`btoa`/`fetch`）让它**不能被 shop-api 消费**，跨端复用度比 shared 低 | 三个以上前端、且要做拦截器/重试/traceId 时上 |
| 塞进 `@shop/shared` | 少一个包 | **污染契约包**：shared 必须保持「无运行时假设、能在 Node 和浏览器同一份产物」；把 `btoa` 放进去，`shop-api` 侧就可能吃到浏览器 API | 不要 |
| 让 shared 只放「错误类」不放 HTTP | 折中 | 收益薄 | 可选 |

结论：**契约（schema/类型）进 shared；传输（fetch/凭据）单独成包或不共享。** 判据就一句——「这段代码是否能在 Node 与浏览器同时以同一份产物运行？」能，才有资格进 shared。这也解释了 `web-next/src/lib/api.ts` 为什么不复用 SPA 那份：它的运行环境没有同源代理、凭据必须留在服务端。

## 10. 替代方案对照：为什么这里手写 Zod

| 方案 | 契约来源 | 运行时校验 | 框架中立性 | 迁移成本 | 适合 |
|---|---|---|---|---|---|
| **手工共享 Zod 包**（本仓库） | 代码（`packages/shared`） | ✅ 同一份 schema 双端执行 | ✅ shared 不依赖 Nest，也不依赖 React/Vue | 低（一个包 + 脚本前缀） | **需要与另一套后端（Spring/Java）逐接口横向对比**；小团队；契约即产品 |
| OpenAPI codegen（`openapi-typescript` + `@asteasolutions/zod-to-openapi`） | 规范文件（`openapi.json`） | 需再接一层 zod | 中：要装 `@nestjs/swagger`（生态里 12.0.4）+ decorators | 中：CI 生成、类型漂移要盯 | 有外部消费者/要对合作方发文档、多语言客户端 |
| tRPC | 服务端 router 的类型 | ✅（配 zod） | ❌ **前后端必须同为 TS，且服务端类型直接决定客户端** | 极低（开发体验最好） | TS 全栈、Next 独占、不需要 REST/其他消费者 |
| GraphQL codegen | SDL + resolver | 需另配校验 | 中 | 中高（要写 schema、学习 cost） | 字段级查询需求多、多客户端各取不同形状 |
| 手写两份 TS 接口（无运行时校验） | 人工 | ❌ | ✅ | 最低 | 只有一次性的演示 |

三个决定性理由，让本仓库选手写：

1. **后端要保持框架中立**。全书的骨架是 Nest 版与 Spring/Java 版**并排同一套 REST 接口**。tRPC 直接把 HTTP 边界抹掉，横向对比就没有对象了；`@nestjs/swagger`  decorators 会让 shop-api 多一层与 Java 版无关的结构。
2. **shared 必须被四个消费方同时吃**。tRPC 的 router 只能被 TS 客户端用；OpenAPI 的类型是生成的、运行时校验还得自己接；手写 schema 是唯一「一份代码既出类型又出校验器」的形态。
3. **契约已经在 Zod 里了**（第 05 章用它做入参校验），再引入规范文件等于同一事实两处维护。

什么时候我会反过来推荐 OpenAPI：接口要发给外部、需要 mock server / 契约测试 / 多语言 SDK，或者消费方超过 5 个。那时候「规范文件是唯一真值」压倒「手写少一层」的收益。

## 11. 命名与目录约定：`packages/` vs `apps/`

本仓库现状（诚实版，不是标准答案）：

```
code/
├── pnpm-workspace.yaml      # 混合 glob：packages/* 与 tools/* 加四个裸目录名
├── packages/shared/         # ← 唯一的可复用「库」，进了 packages/
├── tools/eslint-config/     # ← 「工具包」约定俗成的位置
├── lang-basics/             # ← 可执行笔记，直接放根
├── shop-api/                # ← 应用（后端服务），直接放根
├── web-react/  web-vue/  web-next/   # ← 应用（三个前端），直接放根
└── tsconfig.base.json  package.json
```

对照更主流的两种布局：

| 布局 | 目录 | 好处 | 代价 |
|---|---|---|---|
| `apps/` + `packages/`（可再加 `tooling/`/`infra/`） | `apps/shop-api`、`packages/shared`、`tooling/eslint-config` | 一眼区分「部署单元」与「被引用库」；CI 按目录做影响面切分；工具与业务彻底分层（Turborepo 官方 examples 就这形态） | 要移动 7 个目录、改 workspace glob；大仓才值 |
| 本仓库：扁平 + `packages/*` + `tools/*` | 只有共享库和工具进子目录 | **改动半径最小**：教学仓库里每个路径都能在文档里直接指认，`pnpm --filter @shop/web-vue` 之类命令稳定 | 应用层没有视觉分组，包一多就散 |

命名约定（这套仓库守得很好，值得抄）：

| 约定 | 例子 | 理由 |
|---|---|---|
| scope 表示**产品**，不表示类型 | `@shop/api`、`@shop/shared`、`@shop/web-vue` 同一 scope | 私有包不需要防重名，一个 scope 便于将来整体发布 |
| scope 表示**元工具**时另开 | `@ts/eslint-config`、`@ts/lang-basics` | 「服务于 TS 学习项目本身」与「服务于 shop 业务」是两种生命周期 |
| 目录名 = scope 后段 | `web-vue/` ↔ `@shop/web-vue` | `pnpm --filter` 与文档链接都能少一层查找 |
| 包名里的角色写在后面 | `shop-api`（服务）、`web-*`（前端）、`shared`（契约）、`*-config`（配置） | `grep 'web-'` 就能圈出全部前端 |

迁移建议（真要动的话，按顺序）：① 先加 `apps/`，把 `shop-api` 和三个 `web-*` 移进去（**只有 workspace glob 和 IDE 路径会变**，包名不动，所有 `pnpm --filter` 命令继续有效）；② `tools/` 保持或改 `tooling/`（团队习惯哪个用哪个）；③ `packages/shared` 不动——它已经在正确位置；④ 移完跑一次 `pnpm install` 重新链 symlink，再全量 `pnpm -r typecheck`；⑤ 文档/CI 里对路径的硬编码用一次全量 grep 收尾。什么时候值得做：**包数超过 ~10 个，或者新人开始问「这个目录是应用还是库」**——在那之前，本仓库的扁平结构是合理的。

## 12. `tools/eslint-config`：工具包模式与两套编译器并存

这是本仓库最有意思的一个包，因为它存在的唯一理由是**上游生态还没追上 TS 7**。

[tools/eslint-config/package.json](../code/tools/eslint-config/package.json)：

```json
{
  "name": "@ts/eslint-config",
  "private": true,
  "type": "module",
  "main": "./index.mjs",
  "exports": { ".": "./index.mjs" },
  "dependencies": {
    "@eslint/js": "10.0.1",
    "globals": "17.13.0",
    "typescript": "6.0.3",
    "typescript-eslint": "8.72.0"
  },
  "peerDependencies": { "eslint": ">=10" }
}
```

消费方只做一件事（[web-vue/eslint.config.mjs](../code/web-vue/eslint.config.mjs)）：

```js
export { default } from "@ts/eslint-config";
```

| 设计点 | 为什么这么写 |
|---|---|
| 零构建（直接 `.mjs`） | 配置是数据不是逻辑；引 `dist` 就白加一条 `pnpm --filter @ts/eslint-config build` |
| `typescript: 6.0.3` 放**这个包的 `dependencies`**（不是 dev、不是根） | `typescript-eslint` 要 JS 编译器 API，TS 7（Go 原生）不提供；把它做成**传递依赖**，解析时就落在这个子树里 |
| `eslint: ">=10"` 是 **peer** | lint 的宿主是消费方（各包 `eslint .` + 根装 `eslint@10.13.0`）。写进 `dependencies` 会装出两份 ESLint，插件上下文直接错乱 |
| 共享规则一处改，七包生效 | `no-unused-vars` 的 `^_` 豁免、`eqeqeq: always`、`no-explicit-any: warn`、测试文件放宽 `any` |

配合 pnpm 的**隔离布局**（非 hoisted 的 `node_modules`），出现了本全书最实用的一课——**两套 TypeScript 编译器同时可用**：

| 谁解析 | 拿到的 typescript | 用途 |
|---|---|---|
| `shop-api` / `web-react` / `web-next` / `shared` 的 `tsc` | 7.0.2（各自或根节点） | 类型检查与编译，吃 Go 原生的速度 |
| `web-vue` 的 `vue-tsc` | 6.0.3（包内声明） | SFC 类型检查（第 12 章的事故与绕法） |
| `typescript-eslint`（经 `@ts/eslint-config`） | 6.0.3（该包声明） | lint 时的类型信息 |

npm/yarn1 的扁平提升会把这三方压成同一个顶层版本，逼你二选一；pnpm 的嵌套解析让「不兼容的叶子在自己子树里挑版本」成为常规手段。**这是选 pnpm 最硬的一条理由**，比安装速度更持久。

配置里还有一条值得抄：`ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"]`。少了 `**/.next/**` 就会去 lint Next 生成的 `routes.d.ts` 与 client chunk，报一堆你无权修复的错。第 12 章说的「`.vue` 没被 lint」这个已知缺口，也正是这套配置的边界——它是 TS 配置包，不是 Vue 配置包。

## 13. 本章小结

| 主题 | 一句话 |
|---|---|
| 契约 | schema 是契约，类型是派生物；包必须同时导出值与类型 |
| 工具 | 7 个包只用 pnpm workspace 足够；疼点（构建时间/影响面）出现再上 Turborepo/Nx |
| 版本 | `workspace:*` 杜绝「四端装到不同版本契约」；裸 `*` 会去 registry 撞同名包 |
| 顺序 | `pnpm -r` 只排同名脚本，故每个下游脚本以 `pnpm --filter @shop/shared build` 开头 |
| 格式 | shared 必须是 ESM：CJS 产物在 Node 侧能吃，浏览器里的 Vite 对链接依赖不做预打包 → 空页面。「Node 能吃 CJS」≠「工具链能吃 CJS」；改 ESM 还顺带解掉了 `TS1287` 的开关例外 |
| 路线 | 源码直引 vs 编译产物 vs project references——有一个真实 Node 消费者就选编译产物 |
| DTO | `z.input`（发送）/ `z.infer`（校验后）/ 响应类型三兄弟，命名要分开 |
| 差异 | `599` 与 `599.00` 的语义差被 `toWireDecimal` + schema 收敛在出口一处，不外溢 |
| 替代 | tRPC 快但不中立、OpenAPI 规范重但有外部消费者时才回本；横向对比 Spring 的前提是手写 REST 契约 |
| 分层 | 契约进 shared，传输（fetch/凭据）单独成包或不共享——判据是「同一份产物能否在 Node 与浏览器同时跑」 |
| 工具包 | `@ts/eslint-config` 用 `dependencies` 带 TS 6 + `peerDependencies` 交 ESLint 给宿主，靠 pnpm 隔离布局让两套编译器并存 |

三端共用一份契约的故事到此讲完。第 15 章把镜头拉远到部署形态、进程模型与可观测性——那才是「学完类型」之后真正要付账的地方。
