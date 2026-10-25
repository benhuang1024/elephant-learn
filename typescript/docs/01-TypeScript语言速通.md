# 01 TypeScript 语言速通（PHP 对照版）

> 配套代码：[values-and-types.ts](../code/lang-basics/src/values-and-types.ts)、[money.ts](../code/lang-basics/src/money.ts)、[enum-vs-union.ts](../code/lang-basics/src/enum-vs-union.ts)、[null-safety.ts](../code/lang-basics/src/null-safety.ts)、[hello.ts](../code/lang-basics/scripts/hello.ts)
> 本章假设你熟 PHP 8.x：`declare(strict_types=1)`、构造器属性提升、`?T`、`??`、`?->`、原生 enum。

## 1. 心智模型第一剑：类型只活在编译期

PHP 是“值有类型、变量无类型”，而且**运行时类型检查真实存在**：

```php
$n = 42;
gettype($n);        // "integer"，运行时问得出
is_string($n);      // false
```

TypeScript 的关键认知，[values-and-types.ts](../code/lang-basics/src/values-and-types.ts) 顶栏写得很直白：**类型只存在于编译期，运行时完全消失（type erasure）**。

```ts
export const answer = 42;            // number，但运行时它就是个 JS number
// string 不是类，instanceof string 会直接报错；运行时能依赖的只有 JS 的 typeof
```

后果（[hello.ts](../code/lang-basics/scripts/hello.ts) 的 `erased()` 现场演示）：删掉所有类型注解，程序**一模一样能跑**。

```ts
function erased(): string {
  const list = [1, 2, 3];   // 编译期是 number[]
  return `运行时是 ${Object.prototype.toString.call(list)}`;  // [object Array]
}
```

这条决定了后面一切：泛型擦除、`as` 是“骗编译器不改值”、`enum` 运行时是个对象、边界必须用 Zod 真校验（第 05 章）。

## 2. 基本类型与数字的坑

| PHP | TS/JS | 关键差异 |
|---|---|---|
| `int` / `float` | `number`（一种，IEEE-754 double） | 不区分整浮；`7 / 2 === 3.5`，没有 `intdiv()` |
| `PHP_INT_MAX` 溢出转 float | 超过 `Number.MAX_SAFE_INTEGER` **静默丢精度** | 大整数要显式 `BigInt`：`2n ** 64n` |
| `0.1 + 0.2 != 0.3`（float） | 同样 `0.1 + 0.2 === 0.30000000000000004` | **金额永远别用 double**，见第 07 章 Money |
| `string` | `string` | 单双引号都行，插值用反引号 `` `${x}` `` |
| `bool` | `boolean` | 真值表有坑：`0`/`""`/`null`/`undefined`/`NaN` 都 falsy |
| `array`（万能） | 拆成 `Array` / `Set` / `Map` / 对象 | 见第 03 章 |
| `null` | `null` + `undefined`（**两个空**） | 见第 6 节 |

[values-and-types.ts](../code/lang-basics/src/values-and-types.ts) 的 `numberPitfalls()` 把雷区列成对象：

```ts
sum: 0.1 + 0.2,                 // 0.30000000000000004
intDiv: 7 / 2,                  // 3.5 —— `/` 永远浮点
moduloOfNegative: -7 % 2,       // -1 —— 和 PHP 的 % 一致（截断取余）
nanNotEqualToSelf: selfEqual(NaN), // false —— NaN 是唯一不等于自身的值
looseEqualsNull: undefined == null, // true（=== 才 false）；本仓 eslint 强制 eqeqeq
```

> `==` vs `===`：PHP 转 TS 第一大 bug。格式化工具管不到这里（本仓库连 Prettier 都没装，第 04 章 §10），但 [tools/eslint-config/index.mjs](../code/tools/eslint-config/index.mjs) 里 `eqeqeq: ["error", "always"]` 会拦住你，和 Java 的 `==` 比较引用是同级的心智重建。

函数签名语序和 PHP 几乎一致——参数类型在后、返回类型在括号后：

```php
function greet(string $name, int $times = 1): string { }
```
```ts
function greet(name: string, times = 1): string { }   // 默认值不写类型
```

## 3. 字面量类型：PHP 没有对应物的表达力来源

```ts
export const mode = "fast" as const;   // 类型是字面量 "fast"，不是 string
export type Mode = typeof mode;        // "fast"
```

要点（[values-and-types.ts](../code/lang-basics/src/values-and-types.ts)）：

- `const` 声明把字符串**推断成字面量类型**，`let` 会拓宽成 `string`——这是纯编译期行为，和 `gettype` 无关。
- `typeof` 在 TS 里**双重身份**：既是运行时运算符，也能出现在类型位置（`type AnswerType = typeof answer`）。
- 元组 = 有长度有位置的数组类型：`function moneyParts(n): [yen: number, cents: number]`，比 PHP 的 `list($a, $b)` 精确，还能给每个位置命名。

字面量类型是第 02 章可辨识联合、模板字面量类型的地基，务必先接受“`"paid"` 本身就是一个类型”。

## 4. interface vs type：99% 场景用 interface

[values-and-types.ts](../code/lang-basics/src/values-and-types.ts) 里对象类型就是这么写的：

```ts
export interface ProductView {
  sku: string;
  name: string;
  priceCents: number;
  tags?: readonly string[];   // readonly 数组 ≈ 只读列表，防 push
}
```

| 维度 | `interface` | `type` |
|---|---|---|
| 描述对象形状 | ✅ 首选 | ✅ |
| 联合 / 交叉 / 元组 / 字面量 | ❌ 只能 extends | ✅ 唯一选择 |
| 声明合并（同名自动叠加） | ✅ 库扩展用 | ❌ 重名报错 |
| `extends` 多个 | ✅ | 用 `&` 交叉 |
| 报错信息 | 更友好（显示名字） | 有时展开成匿名 |

经验法则：**对象契约用 `interface`，其它一切（union、function 类型、工具类型别名）用 `type`**。本仓库正这么分工——`ProductView`/`Money` 用 interface/class，`OrderEvent`/`Result` 用 type。

## 5. class：readonly、#private、参数属性、useDefineForClassFields

### 5.1 构造器属性提升：PHP 有，TS 也有（参数属性）

PHP 8 的招牌糖，TS 几乎一比一：

```php
final class OrderService {
    public function __construct(
        private readonly OrderRepository $orders,
    ) {}
}
```
```ts
export class Collection<T> {
  constructor(private readonly items: readonly T[]) {}   // 同形
}
```

见 [generics.ts](../code/lang-basics/src/generics.ts) 的 `Collection`、[error-handling.ts](../code/lang-basics/src/error-handling.ts) 的 `AppError`（`readonly status: number` 直接写在构造器参数上）。

**但参数属性是“有语义”的语法**——它会生成 `this.items = items` 赋值代码。于是两个后果：
1. `node file.ts` 原生擦除**跑不了**参数属性（[hello.ts](../code/lang-basics/scripts/hello.ts) 注释明说）；
2. 见 5.3 的 `useDefineForClassFields` 坑。

### 5.2 readonly vs #private：两种“私有”

[money.ts](../code/lang-basics/src/money.ts) 用 `readonly` 字段 + `private` 方法做不可变值对象：

```ts
export class Money {
  readonly cents: number;
  readonly currency: string;
  private assertSameCurrency(other: Money): void { ... }   // 编译期私有，运行时仍可读
}
```

| | `private` | `#field`（真正的 JS 私有） |
|---|---|---|
| 运行时 | 仍在对象上，可 `obj["x"]` 读到 | 引擎级隐藏，读不到 |
| 结构化类型影响 | **参与比较**，别人无法伪造形状（名义化） | 同样 |

[structural-typing.ts](../code/lang-basics/src/structural-typing.ts) 的 `Counter` 注释点破：`private` 字段会让结构比较失败，于是 class 变相成了“只有自己能赋给自己”的名义类型——这是第 02 章 brand 的前身。

### 5.3 useDefineForClassFields：NestJS 必须关的那个开关

`target` 到 ES2022+ 时，`useDefineForClassFields` **默认 true**，字段用语义 `[[Define]]` 初始化（无初始值的声明会变成真实 `undefined` 属性）。这会和两件事打架：

- **装饰器 + 元数据反射**（NestJS 的依赖注入靠 `emitDecoratorMetadata`）；
- **参数属性 / 继承里覆盖字段**。

所以 [shop-api/tsconfig.json](../code/shop-api/tsconfig.json) 显式关掉它，并配套：

```jsonc
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "useDefineForClassFields": false,
  "strictPropertyInitialization": false   // NestJS 的注入字段不在构造器赋值
}
```

> 本机能确认：TS 7 **确实支持** `experimentalDecorators` + `emitDecoratorMetadata`（`tsc` 会发出 `__metadata("design:paramtypes", [Foo])`），所以 NestJS 用纯 `tsc` 就能构建，不需要 SWC 那套 builder。

## 6. enum vs 字面量联合：社区答案是“别用 enum”

PHP 8.1 的 enum 是真类：

```php
enum OrderStatus: string {
    case Paid = 'paid';
}
OrderStatus::from('paid');   // 运行时可校验，非法值抛错
```

TS 的 `enum` 编译成一份**双向映射对象**，看着方便，实则坑多。[enum-vs-union.ts](../code/lang-basics/src/enum-vs-union.ts) 给了正解与反例。

**正解：`as const` 数组 + 字面量联合 + 独立函数。**

```ts
export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled" | "refunded";
export const ORDER_STATUSES = ["pending", "paid", "shipped", "cancelled", "refunded"] as const;
export type FromList = (typeof ORDER_STATUSES)[number];   // 从数组反推 union

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { /* 漏一个 key 就编译报错 */ };
export function parseStatus(raw: string): OrderStatus {
  if (!(ORDER_STATUSES as readonly string[]).includes(raw)) throw new Error(`未知状态: ${raw}`);
  return raw as OrderStatus;   // 上一行守卫保证断言安全
}
```

为什么社区推荐它：

| 问题 | `enum` | 字面量联合 + `as const` |
|---|---|---|
| 和 `isolatedModules` / `verbatimModuleSyntax` 冲突 | 数字 enum 跨文件内联会出问题 | 无 |
| 和 Node 原生 `node file.ts` 擦除冲突 | ❌ enum 需生成代码 | ✅ 纯类型 |
| 数字 enum 的安全 | `999 as LegacyCode` 竟能通过（见 `legacyHole()`） | 白名单天然封闭 |
| Zod 能否校验 | ❌ `z.enum()` 只认字符串字面量数组 | ✅ 直接喂 `ORDER_STATUSES` |
| 值域=类型=运行时白名单 三者合一 | 分散 | 一次搞定 |

**`const enum` 与 `isolatedModules` 的冲突**（本仓库基座开了 `isolatedModules: true`，见 [tsconfig.base.json](../code/tsconfig.base.json)）：`const enum` 依赖“编译时内联成员值”，而 `isolatedModules` 要求每个文件能**单独**编译（看不到别的文件的 enum 定义），于是 TS 直接禁止在 `isolatedModules` 下用 `const enum`。原生 `node file.ts` 同理跑不了。三重理由指向同一个结论：**用字面量联合**。

反例还留在文件里（`export enum LegacyCode`）演示数字洞：`return 999 as LegacyCode;` 编译通过、运行时无校验——这就是 enum 安全性“远低于看起来的样子”的实证。

## 7. null / undefined 与 strictNullChecks

PHP 只有 `null` 一种空。JS 有 **两种**：

- `null`：显式的空（`typeof null === "object"` 是历史 bug）；
- `undefined`：“没赋值 / 没 return / 数组越界”的默认态。

基座里 `"strict": true` 打开了 `strictNullChecks`——[null-safety.ts](../code/lang-basics/src/null-safety.ts) 顶栏称它是 **TS 最有价值的特性**：开启后 `null`/`undefined` 不再能塞进任何类型，相当于 PHP 里“每个可空的地方都得写 `?`”。

```ts
// PHP: function find(int $id): ?Product
export function findById(id: number, rows: readonly { id: number }[]): { id: number } | undefined {
  return rows.find((row) => row.id === id);   // Array.find 返回类型天生带 undefined，编译器逼你处理
}
```

## 8. 可选链 / 空值合并：PHP 的 ?-> 和 ?? 基本能对上

```php
$city = $user?->profile?->address?->city ?? '未知';
```
```ts
export function cityOf(user: { profile?: { address?: { city?: string } | null } | null }): string {
  return user.profile?.address?.city ?? "未知城市";   // ?. ≈ ?->，?? ≈ ??
}
```

对照见 [null-safety.ts](../code/lang-basics/src/null-safety.ts)：

| 写法 | 语义 | 陷阱 |
|---|---|---|
| `a?.b` | 链路任一环为 null/undefined 就短路返回 undefined | 只保证“不炸”，结果仍是 undefined，链尾常还要 `??` |
| `a ?? b` | 仅 null/undefined 才取 b | ≈ PHP `??` |
| `a \|\| b` | 任何 **falsy** 都取 b | `count \|\| 10` 会把 `0` 吃成 `10`（`fallbackDemo()` 现场演示） |
| `a ??= b` | 与 PHP `??=` 同名同义 | — |
| `x!` | 非空断言“我保证不是 null” | 相当于无视可空注解直接 `->`，出事自己扛 |

> 收窄的软肋（同文件末注释）：TS 对 null 收窄很聪明，但**回调里重新读取不保证**，所以你在 `setTimeout`/`map` 回调里会看到 “object is possibly undefined”。还有 `noUncheckedIndexedAccess: true`（基座开着）让 `names[1]` 的类型带上 `undefined`，更接近 PHP “越界给 null” 的现实，而不是假装安全。

## 9. ESM 模块与 `.js` 扩展名要求

本仓库全是 ESM（各包 `"type": "module"`）。这里有个 PHP 人完全没见过的规则：

**在 Node ESM 下，相对 import 必须写扩展名，而且写的是 `.js`——即便你 import 的是 `.ts` 文件。**

看 [shop-api/src/main.ts](../code/shop-api/src/main.ts)：

```ts
import { AppModule } from "./app.module.js";                          // 源文件是 app.module.ts
import { requestIdMiddleware } from "./common/request-id.middleware.js";
```

原因：运行时 Node 只看编译产物 `.js`，TS 的类型擦除**不会重写你的 import 路径**。`moduleResolution: "nodenext"` 要求 import  specifier 和真实文件一致。

为什么必须 `.js`：NestJS 12 发布的包是 **ESM-only**。如果把 `shop-api` 编成 CommonJS 去 import 它，`tsc` 报 **TS1479**（“当前文件会导入 ESM 模块，但必须有 type 'module'”）。所以 [shop-api/package.json](../code/shop-api/package.json) 末尾写了 `"type": "module"`，全仓相对 import 带 `.js`。

三种包各自的 import 风格（都在仓库里，别混）：

| 包 | 模块/产出 | import 扩展名写法 | 为什么 |
|---|---|---|---|
| [shop-api](../code/shop-api/src/main.ts) | ESM（`type: module`），tsc 产出到 dist | `./x.js` | Node ESM 运行时要求 |
| [packages/shared](../code/packages/shared/src/index.ts) | ESM（`type: module`），tsc 产出到 dist 供四端消费 | `./decimal.js`（带扩展） | `module: nodenext` + ESM 包，扩展名不能省；改成 CJS 产物会让浏览器里的 Vite 报「does not provide an export named …」（第 04 章有现场） |
| [lang-basics](../code/lang-basics/src/utility-types.ts) | 纯检查（`noEmit`），靠原生擦除跑 | `./generics.ts` | `allowImportingTsExtensions: true` |

> `verbatimModuleSyntax: true`（基座）还带来一条：纯类型导入必须写 `import type { X }`（见 [utility-types.ts](../code/lang-basics/src/utility-types.ts) 第 20 行 `import type { Entity } from "./generics.ts"`），因为它不会被擦掉——这防止“值导入”被误当类型删掉。

## 10. 类型擦除的运行时后果（本章收尾）

回到第 1 节那句话，落成三条工程纪律：

1. **`as` 是骗编译器，不改值**（[values-and-types.ts](../code/lang-basics/src/values-and-types.ts) `unsafeCastExample`）：`payload as ProductView` 不校验任何东西，边界必须用 Zod（第 05 章）。
2. **泛型运行时不存在**（[generics.ts](../code/lang-basics/src/generics.ts) `erasedHint`）：`typeof value` 只能问 JS，不能问 `T`；要按类型分派就传判别字段或 class。
3. **`enum`/参数属性需要生成代码**，纯类型擦除（`node file.ts`）跑不了——这与第 6 节“别用 enum”是同一个理由的两种表现。

一句话总结给架构师：**TS 的类型是给编译器和 IDE 用的契约，不是给运行时用的保险。契约之外的世界（JSON、数据库、HTTP）一律要在边界重新校验。**

## 11. 本章自测

把下面 PHP 写成 TS，再对照配套文件：

```php
final class Line {
    public function __construct(private readonly string $sku, public readonly int $priceCents) {}
    public function withTax(int $rate): Line { return new Line($this->sku, intdiv($this->priceCents * (100+$rate), 100)); }
}
```

<details>
<summary>参考答案</summary>

```ts
export class Line {
  constructor(private readonly sku: string, readonly priceCents: number) {}
  withTax(ratePercent: number): Line {
    return new Line(this.sku, Math.round(this.priceCents * (1 + ratePercent / 100)));
  }
}
```

差异点：`intdiv` 没有对应物（`/` 永远浮点，四舍五入用 `Math.round`）；参数属性虽同形，但会让 `node file.ts` 跑不了；`readonly` 只在编译期生效，运行时仍可读——想要真私有就 `#priceCents`。对照 [money.ts](../code/lang-basics/src/money.ts) 的 `applyDiscount()`。
</details>
