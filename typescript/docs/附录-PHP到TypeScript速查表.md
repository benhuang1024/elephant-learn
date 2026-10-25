# 附录：PHP → TypeScript 速查表

面向 10 年 PHP/Laravel 架构师。左列是你熟的那句，中列是对应写法，第三列是「不写就会翻」的那一点。
配套代码在 [code/](../code/)：语言层看 [lang-basics/src/](../code/lang-basics/src/)，框架层看 [shop-api/src/](../code/shop-api/src/)，契约层看 [packages/shared/src/](../code/packages/shared/src/)。

## ① 语法映射

| PHP | TypeScript | 关键差异与坑 |
|---|---|---|
| `$x = 1;` | `const x = 1;` / `let x = 1;` | **没有变量自动声明**；`var` 是函数作用域，现代代码只用 `const`，需要重赋值才用 `let` |
| `function f(int $x): string {}` | `function f(x: number): string {}` | 类型写在名字**后面**；类型会被擦除，运行时不存在（`shop-api` 靠 Zod 补） |
| `declare(strict_types=1);` | `tsconfig` 的 `strict: true`（见 [tsconfig.base.json](../code/tsconfig.base.json)） | TS 的 strict 是一组开关不是模式；不写类型 = 隐式 `any`，不报错也不检查 |
| `const MAX = 10;` | `const MAX = 10;`（全局常量用 `as const` 或 `readonly`） | JS 的 `const` 是「绑定不可变」，对象内容仍可改 |
| `"Hi $name"` / `{$obj->k}` | `` `Hi ${name}` `` | 模板字面量里可以放任意表达式；单/双引号不插值 |
| `$a . $b` | `${a}${b}` 或 `a + b` | **`+` 是数字相加或字符串拼接**，看操作子类型：`"1" + 1 === "11"`，`1 + "1" === "11"` |
| `$a === $b` | `a === b` | JS 的 `===` 对对象比**引用**（≈ PHP `===` 对对象比同一实例）；比内容要 `Object.is` 或手写深比较 |
| `$x ?? 'default'` | `x ?? "default"` | 只对 `null`/`undefined` 生效，**不像 `a \|\| b` 那样把 `0`/`""`/`false` 也吃掉** |
| `$a ?: $b`（elvis） | `a \|\| b` | JS 没有 elvis；`a \|\| b` 的语义就是「falsy 就取 b」，所以 `0 \|\| 5 === 5` 是经典 bug |
| `$u?->address?->city` | `u?.address?.city` | 可选链只在左侧为 null/undefined 时短路；`arr?.[0]`、`fn?.()` 同型 |
| `match($x) { 1,2 => 'a', default => 'b' }` | `switch (x) { case 1: case 2: return "a"; default: return "b"; }`，或 `const m = {1:"a",2:"b"}[x] ?? "c"` | `switch` **不 break 会贯穿**（`noFallthroughCasesInSwitch` 已在本仓库打开）；对象字典只接受 string/number 键 |
| `match(true) { $a > 10 => … }` | 三元链，或 `if/else if` | 没有等价物。范围判断写 `if (x >= 1 && x <= 3)`，别硬凑对象键 |
| `foreach ($list as $v)` | `for (const v of list)` | `of` 用于可迭代对象；`in` 用于**对象的键**（`for (const k in obj)` 还会遍历原型链，几乎总是错的） |
| `foreach ($arr as $k => $v)` | `for (const [k, v] of Object.entries(obj))` | 数字键会被重排到前面（JS 对象的整数键先按升序），要稳定顺序就改用 `Map` |
| `array_map(fn, $xs)` | `xs.map(fn)` | 方法而非外部函数；回调签名是 `(item, index, array)`——**直接把 `map` 传给 `parseInt` 会翻车**（第二个参数成了 radix） |
| `fn($x) => $x * 2` | `(x) => x * 2` | 同 |
| `function () use ($y) { … }` | `( ) => { …y… }` | 箭头函数**词法 `this`**（≈ 自动 capture `$this`），普通 `function` 的 `this` 由调用方式决定 —— 这是 PHP 人第一大坑 |
| `Closure::bind` / `$this` 在闭包里 | `.bind(this)` 或存 `const self = this` | Nest 的装饰器包装方法时就有这个动作，见 [timed.decorator.ts](../code/shop-api/src/common/timed.decorator.ts) 的 `function wrapped(this: {…})` |
| `$x instanceof Foo` | `x instanceof Foo` | TS 里还能**收窄类型**；但 `instanceof` 认的是原型链，跨 realm/跨包副本会失效 |
| `clone $obj`（浅） | `{ ...obj }`（浅） | 展开只拷第一层，嵌套对象仍是同一个引用，见 [array-functions.ts 的 `shallowVsDeep`](../code/lang-basics/src/array-functions.ts) |
| 深拷贝 | `structuredClone(obj)` | Node 18+/浏览器原生；**函数、Symbol、原型链、类实例会被丢掉或抛错**（≈ PHP 序列化会丢 resource） |
| `static $cache = [];`（函数内静态变量） | 模块作用域的 `const cache = new Map()` | JS 没有函数级静态变量；闭包是常见替代。**模块级变量 = 全进程共享**（常驻进程！） |
| `final class` / `readonly class` | `final class`（有）/ 属性写 `readonly` 或 `Readonly<T>` | PHP 的 `readonly class` 是 8.3 才有的；TS 侧要「不可变值对象」就构造即校验 + 只读字段 + 返回新实例（[money.ts](../code/lang-basics/src/money.ts) 的 `plus`/`minus`） |
| `enum Status: string` | `const S = ["PENDING","PAID"] as const; type S = (typeof S)[number]` | 用 union 而不是 `enum`（`const enum` 与 `isolatedModules` 冲突）；本仓库 [order.ts](../code/packages/shared/src/order.ts) 就是 `ORDER_STATUSES as const` + `z.enum` |
| 命名参数 `f(width: 10, height: 20)` | 对象参数 `f({ width, height })` + 解构 | 惯用法；配合 `Partial<T>` 做可选配置，配合 `satisfies` 做穷尽检查 |
| `list($a, $b) = $arr` | `const [a, b] = arr;` / `const { x, y } = obj;` | 可给默认值、可用 `...rest`；`[a,b] = [b,a]` 交换是合法惯用法 |
| `...$args`（变长参数） | `(...args: number[])` | 展开只能用在调用/构造/数组字面量；对象展开 `{...obj}` 是浅拷贝不是合并语义 |
| `yield` / 生成器 | `function* f() { yield x }` / `for (const x of it)` | 异步版本 `async function*` + `for await…of`，是处理大流（≈ Laravel `chunk`）的正确姿势 |
| `#[Route('/x')]`、`#[Attribute]` | `@Controller("api/products")`、`@Get()`、`@Roles("ADMIN")` | PHP 属性是**运行时反射读元数据**；TS 装饰器是**函数包装**，且 Nest 还要 `emitDecoratorMetadata` + `reflect-metadata`（见 [main.ts](../code/shop-api/src/main.ts) 第一行 import） |
| `__toString()` | `toString()` | 模板字面量会调它；但 `String(obj)` 与 `obj + ""` 都会走 `Symbol.toPrimitive`，行为比 PHP 更绕 |
| `__invoke()` | 函数本身 / 返回函数的工厂 | JS 的「可调用」是原生能力，`const fn = () => …` 即可 |
| `namespace App\Order;` + `use …` | 文件即模块 + `import { X } from "./x.js"` | 没有命名空间声明；**ESM 下相对路径必须带扩展名**（`.js`，见第 ④ 段） |
| `trait` | mixin 函数 / 接口 + 组合 / 高阶类 | 没有多继承混入的原生等价物；推荐「返回类的工厂函数」而不是原型链魔法 |
| `interface` + `implements` | `interface`（**结构化**，不写 `implements` 也成立） | PHP 是名义类型，TS 是**形状相同就兼容**；要名义语义得用 branded type（[branded-ids.ts](../code/lang-basics/src/branded-ids.ts)） |
| `int\|string` 联合类型 | `string \| number` | 同概念；用法要收窄（`typeof`、`in`、`instanceof`、`is` 守卫），见 [narrowing-and-unions.ts](../code/lang-basics/src/narrowing-and-unions.ts) |
| `mixed` | `unknown`（首选）/ `any`（尽量避免） | `unknown` 强制你收窄再用；`any` 关掉一切检查 |
| `?Foo` | `Foo \| null`（还要考虑 `undefined`） | JS 有**两种**空值；`?: T` 可选属性意味着 `undefined`，不意味着 `null` |
| `throw new X()` | `throw new X()` | 但 JS 什么都能 throw（字符串、`undefined`），所以 `catch (e)` 的 `e` 是 `unknown`；纪律：只 throw `Error` 子类（见 [error-handling.ts](../code/lang-basics/src/error-handling.ts)） |
| `catch (\Exception \| \Error $e)` | `try { } catch (e) { if (e instanceof AppError) … }` | 没有 multi-catch 语法；`finally` 有；受检异常**不存在**，签名不告诉你会不会抛 |
| `new Exception($msg, 0, $previous)` | `new Error(msg, { cause })` | ES2022 的 `cause`，本仓库 `AppError` 就在用它（`{ cause }` 传进 `ErrorOptions`） |
| `exit()` / `die()` | 库代码里**不要**；入口用 `process.exit()` | 常驻进程里 `process.exit()` 会砍掉所有在途请求（第 15 章第 3 节） |
| `defined('X')` / `constant('X')` | 不存在，用 `import` | 没有运行时符号表；这也是为什么「字符串拼类名然后 new」在 TS 里要靠显式注册表 |

## ② 常用函数映射

| PHP | JavaScript / TypeScript | 坑 |
|---|---|---|
| `count($arr)` | `arr.length` / `Object.keys(obj).length` / `map.size` | 对象没有 `length`；`Set`/`Map` 用 `.size` |
| `empty($x)` | `!x` | **语义不等价**：`empty([])` 是 true，但 `![]` 是 **false**（数组恒 truthy）；`empty("0")` 是 true，`!"0"` 是 false。判空要写 `arr.length === 0` |
| `is_null($x)` | `x === null` | 想同时判两种空值：`x == null`（唯一推荐用 `==` 的场合）；`typeof null === "object"` 是历史 bug |
| `isset($a['b'])` | `a?.b !== undefined` | `isset` 是「非 null 且已定义」，`!== undefined` 不管 `null`；三者要想清楚 |
| `array_key_exists($k, $m)` | `Object.hasOwn(m, k)`（Node 18+）/ `k in m` | `in` 会查原型链，脏数据从这里来；`hasOwnProperty` 老写法不要直接调 |
| `in_array($x, $arr)` | `arr.includes(x)` | `includes` 是严格比较（无 `==` 第三参数的松散语义）；`NaN` 例外（`includes` 能找到 `NaN`，`indexOf` 不能） |
| `array_search($v, $a)` | `a.findIndex(x => …)` / `a.indexOf(v)` | 找不到返回 `-1`，不是 `false`；`if (idx !== -1)`，别写 `if (idx)`（0 会被吃掉） |
| `array_keys` / `array_values` | `Object.keys` / `Object.values` / `Object.entries` | 返回的都是**字符串**键（数字键也转成 string） |
| `array_merge($a, $b)` | `[...a, ...b]` / `Object.assign({}, o1, o2)` / `{...o1, ...o2}` | 数字键在 PHP 里会被重排，JS 里对象数字键按插入顺序但整数键提前；`Object.assign` 是浅合并 |
| `array_unique` | `[...new Set(arr)]` | 必须展开回数组；对象数组按引用去重，要按字段去重得手写 |
| `array_column($rows, 'name')` | `rows.map(r => r.name)` | 带索引列：`Object.fromEntries(rows.map(r => [r.id, r]))` ≈ `array_column($rows,'x','id')` |
| `array_combine` / `array_flip` | `Object.fromEntries(keys.map((k,i) => [k, vals[i]]))` / 同上换位 | `Object.fromEntries` 遇重复键**后值覆盖前值**（PHP `array_combine` 同） |
| `array_sum` | `arr.reduce((s, x) => s + x, 0)` | **初始值必须给**，空数组 `reduce` 会抛 `TypeError`；金额不要用 `reduce` 直接加（见第 ④ 段浮点行） |
| `array_reduce($a, $fn, $init)` | `arr.reduce(fn, init)` | 回调参数顺序**相反**：PHP `($carry, $item)`，JS `(acc, item)` 一样，但 PHP 可传多个数组，JS 不行 |
| `array_filter($a)`（去 falsy） | `arr.filter(x => Boolean(x))` | 语义确实一致（falsy 全去掉），包括 `"0"` 与 `0`；「过滤 0 库存」要写明确条件（[array-functions.ts](../code/lang-basics/src/array-functions.ts) 的 `inStock`） |
| `array_slice($a, 2, 3)` | `arr.slice(2, 5)` | 第二参数是**结束下标不是长度**；负数从尾部算 |
| `array_splice` | `arr.splice(i, n, …items)` | `splice` **原地修改并返回被删元素**，`slice` 返回副本 —— 名字太像，PHP 人最常写错的一个 |
| `range(1, 10)` | `Array.from({ length: 10 }, (_, i) => i + 1)` | 没有内置 range；`[...Array(10).keys()]` 也行但可读性差 |
| `sort` / `usort` | `arr.sort((a, b) => a - b)` | **无比较函数时按字符串字典序**：`[10, 9, 1].sort()` → `[1, 10, 9]`；且 `sort` **原地修改**，先 `[...arr]`（仓库里的反例函数 `naiveNumberSort`） |
| `asort` / `ksort` | 对象无顺序保证；要排序先 `Object.entries(x).sort(…)` | 现代引擎按「整数键升序 + 字符串插入序」，别依赖它；需要顺序请用 `Map` |
| `array_multisort` / `usort` 多级 | `arr.sort((a,b) => a.x - b.x \|\| a.y.localeCompare(b.y))` | `localeCompare` 用于中文/带重音字符串，`<` 比较的是码点 |
| `str_contains` / `str_starts_with` | `s.includes(x)` / `s.startsWith(x)` / `s.endsWith(x)` | 区分大小写（同 PHP 8）；要 `ignoreCase` 得自己 `toLowerCase()` 并注意 Unicode（`İ`） |
| `strpos($h, $n)` | `h.indexOf(n)` | 未命中 PHP 给 `false`、JS 给 `-1`；`if (pos !== -1)` |
| `trim($s)` | `s.trim()` / `trimStart` / `trimEnd` | PHP 默认字符表是 `" \t\n\r\0\x0B"`；JS `trim` 按 Unicode 空白，**`\u00A0`（NBSP）会被 JS 去掉而 PHP 不会**。自定义 charlist 要 `s.replace(/^[\s.]+/u, …)` 自己写 |
| `explode(',', $s)` / `implode(',', $a)` | `s.split(",")` / `a.join(",")` | **limit 语义完全不同**：`explode(",", "a,b,c", 2)` → `["a","b,c"]`；`"a,b,c".split(",", 2)` → `["a","b"]`（直接截断）。要「保留剩余」得手写 |
| `str_replace` | `s.replaceAll(a, b)` | `s.replace(a, b)` **只换第一个**；传正则时 `$1` 是反向引用而 PHP 用 `$1` 在 preg_replace 里同 |
| `str_pad` / `str_repeat` | `s.padStart(n, "0")` / `s.padEnd(n)` / `s.repeat(n)` | `padStart` 在字符串已长于 n 时返回原串（同 PHP）；`str_pad` 的 `STR_PAD_BOTH` 要自己算 |
| `sprintf('%0.2f', $n)` | 模板字面量 + `n.toFixed(2)` | `toFixed` **返回字符串**，且受浮点表示影响：`(1.005).toFixed(2) === "1.00"`；千分位用 `toLocaleString` 或 `Intl.NumberFormat` |
| `number_format($n, 2, '.', ',')` | `new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)` | 仓库示例：[time.ts 的 `formatForDisplay`](../code/packages/shared/src/time.ts) 与三套前端的 `formatAmount` |
| `money_format`（PHP 8 已移除） | `Intl.NumberFormat(locale, { style: "currency", currency: "CNY" })` | **别在这里做金额运算**，只做展示；运算走整数分/`DecimalAmount` |
| `round($x, 2, PHP_ROUND_HALF_UP)` | `Math.round(x)`（只能取整，且 `-0.5` → `-0`，是**向正无穷**取整） | 想要 half-up 得自己写 `Math.round(x * 100 + Number.EPSILON) / 100`，且别用在钱上 |
| `0.1 + 0.2 === 0.3` | `false`（`0.30000000000000004`） | 比较浮点用 `Number.EPSILON`：`Math.abs(a - b) < Number.EPSILON`；`Number.EPSILON ≈ 2.22e-16` 是**相对**精度，绝对值大的数不够用。钱的唯一答案：整数分（[decimal.ts](../code/packages/shared/src/decimal.ts)、[money.ts](../code/lang-basics/src/money.ts)） |
| `==` 松散比较 | `===`（还有 `Object.is`） | `Object.is(NaN, NaN) === true`（`===` 对 `NaN` 为 false）、`Object.is(0, -0) === false`；本仓库 lint 打开 `eqeqeq: always` |
| `is_nan` / `is_finite` | `Number.isNaN(x)` / `Number.isFinite(x)` | **不要用全局 `isNaN(x)`**：它先做 `Number(x)` 强转，`isNaN("abc")` 也是 true；`parseInt` 只在传了 radix 时才可信 |
| `intval` / `(int)` / `(string)` | `Number(x)` / `Math.trunc(x)` / `String(x)` | `parseInt("08")` 现在没问题（默认 radix 10），但**必须显式传 10**；`Number("")` 是 `0`，`Number(" ")` 也是 `0` |
| `json_encode` / `json_decode` | `JSON.stringify(v)` / `JSON.parse(s)` | `undefined`、函数、`Symbol` 被静默丢掉；`Date` 变 ISO 字符串；`NaN`/`Infinity` 变 `null`；`JSON.parse` 的返回类型是 `any` → **必须过 Zod**（三套前端的 `…Schema.parse(await response.json())`）。`JSON.parse` 无 `assoc` 概念，本来就有原型 |
| `date('Y-m-d H:i:s')` / `time()` | `new Date()` + `Intl` / `Date.now()` | **`new Date()` 的方法全是本地时区**：`toISOString()` 给 UTC 带 `Z`，`getFullYear()` 给本地。UTC 日期跨天差一天是本项目最常见的线上事故源；仓库为了对齐 Java 的 `LocalDateTime` 手拼了 [localIsoDateTime](../code/packages/shared/src/time.ts) |
| `strtotime($s)` / `new DateTime($s)` | `Date.parse(s)` / `new Date(s)` | **非 ISO 字符串的解析是实现相关的**：`"2026-10-25"` 按 UTC 零点，`"2026/10/25"` 按本地 —— 同一天差 8 小时。生产用 `date-fns`/`Temporal`（提案已进 Node 的兼容路径有限），别赌 |
| `Carbon` | `date-fns` / Day.js / Luxon / Temporal | 没有全民标准件；`Intl` 只做格式化不做计算 |
| `uniqid()` / `Str::uuid()` | `crypto.randomUUID()` | Node 内置，无需依赖；`crypto.randomBytes(16).toString("hex")` ≈ `bin2hex(random_bytes())` |
| `random_int(1, 10)` | `crypto.randomInt(1, 11)` | **上界是排他的**（PHP 是包含的）——off-by-one 制造机；非安全场景才用 `Math.random()` |
| `password_hash($p, PASSWORD_BCRYPT)` | `bcrypt.hash(p, 12)`（`bcrypt`/`bcryptjs`）或 `argon2`/`node:crypto.scrypt` | 迁移时注意前缀：PHP 生成 `$2y$`，多数 JS 库产 `$2a$`/`$2b$`；`bcryptjs` 能验 `$2y$`，原生 `bcrypt` 需确认版本。**BCrypt 72 字节截断**两边一致 |
| `password_verify` | `bcrypt.compare(p, hash)`（内部已做定长比较） | 自己写比较要用 `crypto.timingSafeEqual`，且长度不同要先处理（[users.service.ts](../code/shop-api/src/auth/users.service.ts) 的 `constantTimeEquals` 就是这么写的） |
| `md5` / `sha1` / `hash('sha256', $s)` | `createHash("sha256").update(s).digest("hex")` | Node 的 `crypto.createHash` 不是 web 的 `crypto.subtle`（后者异步）；`node:` 前缀 import 才说明是服务端 |
| `file_get_contents` / `file_put_contents` | `fs.readFileSync` / `fs.promises.readFile` | **同步版会阻塞整个进程的所有请求**（≈ 但影响面比 PHP 大一万倍）；HTTP 取资源用 `fetch` |
| `sleep(1)` / `usleep` | `await new Promise(r => setTimeout(r, 1000))` | 没有「阻塞当前 worker 但别人不受影响」的语义；`setTimeout(fn, 0)` 是**宏任务**排到下一轮，见 [traceOrder](../code/lang-basics/src/async-event-loop.ts) |
| `var_dump` / `print_r` / `dd()` | `console.log(x)` / `console.table(rows)` / `node:util.inspect(x, { depth: null })` | `console.log(obj)` 只显示一层且是**活引用**；生产靠结构化日志（第 15 章第 4 节），不是靠 `console.log` |
| `filter_var($x, FILTER_VALIDATE_INT)` | `z.int().safeParse(x)` / `Number.isInteger(Number(x))` | 空串、`" 12 "`、`"12abc"` 三者行为都不一样；`Number("") === 0` 是经典坑 |
| `array_is_list` | `Array.isArray(x) && x.every((_, i) => i in x)` | 校验外部 JSON 时很有用，配合 `z.array()` |
| `extract()` / `compact()` | 解构 / 对象字面量简写 `{ a, b }` | JS 没有变量名魔法；这是好事 |

## ③ 框架概念映射（Laravel / Symfony ↔ Nest / Next / React / Vue）

| Laravel / Symfony | Node / TS 对应 | 备注（本仓库实物） |
|---|---|---|
| `php artisan serve` | `pnpm dev` / `node dist/main.js`（本仓库 `dev` = 先 build 再跑） | 没有内置 dev server 的重载魔法，用 `node --watch` |
| `composer.json` / `composer.lock` | `package.json` / `pnpm-lock.yaml` | `"type": "module"`、`exports`、`workspace:*` 是 Composer 没有的概念 |
| Packagist | npm registry | 私有源用 `.npmrc`，≈ `repositories.packagist.org` |
| `vendor/` + autoload PSR-4 | `node_modules/` + `package.json` 的 `exports`/`types` | pnpm 是软链树，不是扁平；幽灵依赖回归风险见第 15 章 |
| ServiceProvider / `bootstrap/app.php` | `@Module({ imports, providers, controllers, exports })` | [app.module.ts](../code/shop-api/src/app.module.ts) 显式列出全部模块，**没有扫包注册** |
| Facade（`DB::`、`Cache::`） | 构造器注入的服务类 | 没有静态门面；全局单例靠 `@Global()` module（本仓库 [common.module.ts](../code/shop-api/src/common/common.module.ts)） |
| Service container / binding | Nest DI（**以类作为 token**） | `constructor(private config: ConfigService)` 就够，不写字符串 id |
| `routes/web.php` + Controller | `@Controller("api/products")` + `@Get()` | 路由旁挂元数据（`@Public()`、`@Roles("ADMIN")`） |
| Middleware | `app.use()`（Express 层）/ `NestMiddleware` / Guard / Interceptor | [request-id.middleware.ts](../code/shop-api/src/common/request-id.middleware.ts) 是函数式中间件；顺序：Middleware→Guard→Interceptor→Pipe→Controller |
| FormRequest `rules()` + `authorize()` | Zod schema + `ZodValidationPipe` | [zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts)，schema 来自共享包 |
| API Resource | wire DTO 函数 | `toProductWire`（[product.repository.ts](../code/shop-api/src/product/product.repository.ts)）—— **不要**直接返回 Drizzle 行 |
| `Validator` 的错误袋 `errors` | problem+json 的 `errors: Record<field, message>` | [field-errors.ts](../code/packages/shared/src/field-errors.ts)（`items[0].quantity` 同 Java 版） |
| Eloquent Model / Query Builder | Drizzle ORM（[schema.ts](../code/shop-api/src/db/schema.ts)）或 Prisma | 本仓库用 `.get()`/`.all()`/`.run()`，**同步驱动**；`.get()` 返回 `T \| undefined` 而非 `Optional` |
| `@Version` 乐观锁 | 手写 `WHERE version = ?` + `changes === 0` | [order.repository.ts](../code/shop-api/src/order/order.repository.ts) |
| `DB::transaction()` | `db.transaction(cb)`（无声明式 `@Transactional`） | 少了代理，也少了「自调用失效」那一类坑 |
| Accessors / Mutators / casts | `$inferSelect` 行类型 + 手写转换函数 | 没有 ORM 层的自动 cast，`price` 在库里是 `text` |
| Migrations `artisan migrate` | `drizzle-kit generate` / `migrate`（Prisma 同理） | [drizzle.config.ts](../code/shop-api/drizzle.config.ts) 已配好，`pnpm db:generate` 跑过并产出 [drizzle/0000_amused_phil_sheldon.sql](../code/shop-api/drizzle/0000_amused_phil_sheldon.sql)；但运行期建表仍走 `SCHEMA_SQL`，`migrate` 未接线 |
| Seeder / Factory | 测试里直接 `createDatabase(":memory:")` + `repo.seed(rows)` | [database.ts 的工厂函数](../code/shop-api/src/db/database.ts) 就是为此存在 |
| `config()` + `.env` + `config:cache` | [config/env.ts](../code/shop-api/src/config/env.ts)（Zod）+ `ConfigModule({ validate, cache: true })` | `cache: true` 的心智 ≈ `config:cache` |
| `APP_ENV` / 多环境文件 | `NODE_ENV` + profile **未实现** | 本仓库只有 SQLite 一条路径 |
| Artisan 命令 | `@nestjs/cli`（本仓库**没有** `nest-cli.json`，直接 `tsc`）/ 自写 `node scripts/x.ts` | Node 24 能直接跑 `.ts` 脚本：[hello.ts](../code/lang-basics/scripts/hello.ts) |
| 队列 Job + Horizon | **BullMQ** worker（Redis）/ Buster（Postgres） | 本仓库未实现；`concurrency` 与事件循环阻塞要一起考虑 |
| Scheduler `->everyMinute()` | Bull repeatable job / `node-cron` | `node-cron` 多副本会跑 N 次（等价于忘了 `withoutOverlapping`） |
| Notification / Mail | Nodemailer / 各家 SDK | 无内置；重试交给队列 |
| `Storage::disk('s3')` | `@aws-sdk/client-s3` | 流式，别 `.buffer` |
| Cache::remember / Redis | `ioredis` 手搓 / `@nestjs/cache-manager` | 没有 `@Cacheable` 那种声明式注解 |
| Event / Listener（同步） | Nest `EventEmitter2` + `@OnEvent` | 进程内，请求结束就没了 |
| Broadcasting / Echo / Pusher | `socket.io` / `ws` / SSE | 多副本要 Redis adapter + sticky session |
| Sanctum / Passport | `@nestjs/passport` + strategy / Auth.js / Lucia | 本仓库是手写 [basic-auth.guard.ts](../code/shop-api/src/auth/basic-auth.guard.ts) 演示 |
| Gate / Policy / `@` middleware | Guard + `SetMetadata` + `Reflector` | [roles.decorator.ts](../code/shop-api/src/auth/roles.decorator.ts) |
| `@AuthenticationPrincipal` | `@CurrentUser()` 参数装饰器 | [zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts) 里 `createParamDecorator` |
| `abort(404)` / `HttpException` | 领域异常 + `@Catch()` Filter | [domain-errors.ts](../code/shop-api/src/common/domain-errors.ts) → [problem.filter.ts](../code/shop-api/src/common/problem.filter.ts) |
| 默认 `{"message","errors"}` 错误体 | RFC 7807 `application/problem+json` | [problem.ts](../code/packages/shared/src/problem.ts)，与 Java 版逐字段对齐 |
| AOP / 拦截器 | Interceptor（rxjs `finalize`）/ 方法装饰器 | [timing.interceptor.ts](../code/shop-api/src/common/timing.interceptor.ts)、[timed.decorator.ts](../code/shop-api/src/common/timed.decorator.ts) |
| Blade 模板 | JSX（React/Next）/ SFC（Vue） | `.tsx` 与 `.vue`；`{ }` 里放表达式，`&&` 代替 `@if` |
| Inertia | Next RSC + Server Action（神似，不是等价物） | [page.tsx](../code/web-next/src/app/page.tsx)、[actions.ts](../code/web-next/src/app/actions.ts) |
| Livewire | 无标准对应（React Server Components 或 htmx） | 别拿 Inertia 心智硬套 RSC |
| Vite 前端装配 | 同一个 Vite（本仓库 Vite 8.3.5，底层是 **rolldown**） | dev proxy 只在开发存在，见第 15 章第 1 节 |
| `mix()` / 版本化 asset | Vite 的 hash 文件名 + CDN | 生产要处理 `index.html` 的缓存策略 |
| Pest / PHPUnit | **Vitest**（API 基本同 Jest）+ supertest | [e2e](../code/shop-api/test/shop-api.e2e.spec.ts)；注意 Vitest 不检查类型 |
| `RefreshDatabase` / Testcontainers | 内存 SQLite + 自建库工厂 | `createDatabase(":memory:")` |
| Telescope / Horizon 面板 | 无内置；OTel / Prometheus + Grafana | 本仓库只有 [actuator.controller.ts](../code/shop-api/src/health/actuator.controller.ts) |
| `Log::channel()` / Monolog Processor | pino child logger / nestjs-cls | 缺口清单在第 15 章第 4 节 |
| 打包：PHP 不打包 | 前端打包（rolldown/Turbopack）、后端不打包（`tsc` 出 dist） | 「后端 bundle」在 Node 里通常弊大于利 |

## ④ 常见坑速查

| 现象 | 原因 | 解法 |
|---|---|---|
| `x.length` 编译报 `possibly undefined` | 开了 `strictNullChecks`（`strict` 的一部分） | 这不是噪音，是 PHP「未定义索引」的提前版；用 `?.`、`??`、显式收窄 |
| `undefined is not an object` 但类型说它不会 undefined | **类型在运行时不存在**（擦除）；接口声明对来自 JSON 的数据毫无约束力 | 一切外部输入按 `unknown` 处理，边界过 Zod `.parse()` |
| `as ProductResponse` 之后字段少了一个也不报错 | `as` 是**改标签，不是转换/校验** | `as` 只用于「编译器信息不足」；数据转换写函数（`toProductWire`） |
| `const { map } = store; map(...)` 里 `this` 没了 | 解构/赋值丢失调用者；JS 的 `this` 由**调用方式**决定 | 箭头函数（词法 this）、`bind`，或把方法写成接收实例的函数 |
| `for (var i…)` 的回调里 `i` 全是最后一个值 | `var` 函数作用域 + 闭包捕获**变量不是值** | 一律 `let`/`const`；需要「捕获当下值」时 `for (const …)` 或 IIFE |
| `a == b` 出现 `"1" == true`、`[] == false` | JS 松散比较的隐式转换表 | `eqeqeq: always`（本仓库 lint 已开）；唯一例外 `x == null` 同时判两种空 |
| 金额相加出现 `0.30000000000000004` | IEEE-754 双精度 | 整数分 + 定点字符串（`DecimalAmount`）；**永远不要**用 `number` 存钱 |
| 前端显示 `¥599` 而 Java 版是 `¥599.00` | `JSON.stringify(599.00)` 必为 `599`（number 无 scale） | 入站立刻收回字符串（`PositiveAmountSchema`），展示层再 `Intl` 格式化 |
| `[10, 9, 1].sort()` → `[1, 10, 9]` | **无比较函数时按字符串字典序**；且 `sort` 原地改数组 | `[…arr].sort((a, b) => a - b)`；反例见 `naiveNumberSort` |
| 单元测试里两个并发请求撞不出乐观锁 409 | `better-sqlite3` 是**同步驱动**，事务期间事件循环停摆 → 请求被串行化 | 换 `pg`/`postgres.js` 异步驱动，冲突窗口才真实存在（[e2e 注释](../code/shop-api/test/shop-api.e2e.spec.ts) 已写明） |
| 接口明明返回 Promise，`try/catch` 抓不到 | 忘了 `await`；`async` 函数的 `throw` 变成 rejected | `catch` 只对 `await` 之后的拒绝生效；或写 `.catch()`；`no-floating-promises` 规则可拦 |
| `Promise.all([...1000])` 全崩，或一个失败全失败 | `Promise.all` 是 fail-fast，且不设并发上限 | 部分成功用 `Promise.allSettled`；限流用 [mapWithLimit](../code/lang-basics/src/async-event-loop.ts) 或 `p-limit` |
| 一个慢循环让整台机器上的所有请求都变慢 | **单线程 + 事件循环被同步代码占住** | CPU 活儿搬 BullMQ worker / `worker_threads`；监控 `eventLoopLag` |
| 用户 A 看到用户 B 的数据 | 把请求级状态放进**模块级变量**（Node 进程常驻） | 状态挂 `request` 对象 / AsyncLocalStorage（第 03 章的 `withdraw` 就是演示这个） |
| `Error [ERR_MODULE_NOT_FOUND]: Cannot find module './x'` 或加了 `.ts` 报错 | ESM 的相对说明符**必须带扩展名**，且要写编译后的名字 | `moduleResolution: nodenext` 下 import 写 `./x.js`（`allowImportingTsExtensions` 只给不产物的包用，如 `lang-basics`） |
| `TS1479`：`… 是 ESM 文件，无法通过 require 加载` | CJS/ESM 混用；NestJS 12.2 的包只提供 ESM 格式 | 让引用方 `"type": "module"`（本仓库 shop-api 与 shared 都是 ESM）。反向的坑同样真实：共享包编成 CJS 时，Node 侧能吃，浏览器里的 Vite 吃不到具名导出（第 04 章第 5 节的空页面事故） |
| 升级 TS 后 `Cannot find module` / `exports` 解析不到包 | `moduleResolution: "node10"`（老 Node 算法）在 TS 7 里已移除 | 改 `nodenext`/`bundler`，并按包格式选 `module` |
| `import Foo from "./foo"` 报「没有默认导出」，或产物里多出无效 import | `verbatimModuleSyntax: true` 要求**类型导入必须 `import type`** | `import type { X } from "./x"`；本仓库 7 个包里只有 shop-api 关掉该开关（`emitDecoratorMetadata` 需要构造器参数的类型引用作为值存活），代价是失去强制约束 |
| `const enum` 报错或运行时 `undefined` | `isolatedModules` 下不能跨文件内联 | 用 `as const` 数组 + union（本仓库 `ORDER_STATUSES`）或普通对象 |
| Nest 注入后属性全是 `undefined` | 装饰器/DI 依赖 `emitDecoratorMetadata`，而 `useDefineForClassFields: true` 改变了字段初始化语义 | shop-api 的 tsconfig 明确写 `useDefineForClassFields: false` + `experimentalDecorators` + `emitDecoratorMetadata`，别「顺手现代化」 |
| `eslint` 启动就崩：`typescript-eslint does not support TS 7.0` | typescript-eslint 8.x 的 peer 是 `typescript >=4.8.4 <6.1.0`，TS 7 不再暴露 JS 编译器 API | **side-by-side**：让 `@ts/eslint-config` 自带 `typescript: 6.0.3`，业务包继续用 TS 7（[index.mjs](../code/tools/eslint-config/index.mjs)） |
| `.vue` 文件类型检查失败或 vue-tsc 崩 | `vue-tsc` 3.3.13 同样依赖 TS 6 | web-vue 独立把 `typescript` 降到 `6.0.3`，**不要**全局降版本 |
| CI 里 `pnpm -r typecheck` 报 `Cannot find module '@shop/shared'` 的类型 | `-r` 只按拓扑序跑**同名脚本**，`typecheck` 不 emit，依赖包的 `dist/*.d.ts` 根本不存在 | 每条脚本前置 `pnpm --filter @shop/shared build`（本仓库所有包就是这么写的），或门禁里先 `pnpm --filter @shop/api... build` |
| 从共享包 `export *` 后，客户端 `import type { X }` 找不到 | 值再导出会带上值；纯类型在 `isolatedModules` 下需要 `export type *` | 显式 `export type { X }` + 单独 `export * from` 值；[index.ts](../code/packages/shared/src/index.ts) 走的是「schema 是值、类型靠 `z.infer`」的路线 |
| 新增一个订单状态，`switch` 忘了分支也不报错 | 普通 `Record<string, …>` 不做穷尽检查 | `satisfies Record<Status, string>` + `never` 兜底；本仓库 [utility-types.ts](../code/lang-basics/src/utility-types.ts) 的 `Complete<T>` 就是同一思路 |
| 401 时前端拿到 problem+json，curl 却拿到另一种 body | Nest 的 Filter 手工复刻了 Spring 的 **Accept 分支**：通配 → `{timestamp,status,error,path}` + `WWW-Authenticate`；`application/json` → 空 body | 别把它当 bug 改；测试用例就在 e2e 里（两条一起跑）。前端永远带 `Accept: application/json` |
| 生产里 `GET /actuator/metrics` 数字对不上真实 QPS | 计数器是**进程内 `Map`**，多 worker 各算各的 | 交给 Prometheus `sum by (...)` 或 Redis；见第 15 章第 3 节 |
| 上线后日志里没有 request id | 日志用的是 Nest 内置 `Logger`（行文本），仓库里**没有 pino 依赖**；`request.requestId` 只进了响应头 | 第 15 章第 4 节的生产配方（pino-http + `genReqId` 复用已有规则） |

## 配套代码索引

| 想查什么 | 去哪里 |
|---|---|
| 金额 / 整数分 / `toFixed` 陷阱 / 值对象 | [lang-basics/src/money.ts](../code/lang-basics/src/money.ts)、[packages/shared/src/decimal.ts](../code/packages/shared/src/decimal.ts) |
| 事件循环顺序、并发限流、`withdraw` 竞态、AbortSignal | [lang-basics/src/async-event-loop.ts](../code/lang-basics/src/async-event-loop.ts) |
| 数组函数逐条对照、浅拷贝 vs `structuredClone`、`sort` 反例 | [lang-basics/src/array-functions.ts](../code/lang-basics/src/array-functions.ts) |
| `unknown` 收窄、Result、异常链 `cause` | [lang-basics/src/error-handling.ts](../code/lang-basics/src/error-handling.ts) |
| 品牌类型（给结构化类型补名义） | [lang-basics/src/branded-ids.ts](../code/lang-basics/src/branded-ids.ts) |
| 工具类型 / 递归映射 / `infer` / 类型体操的代价 | [lang-basics/src/utility-types.ts](../code/lang-basics/src/utility-types.ts) |
| ESM + `.js` 说明符 + Nest 启动与优雅停机 | [shop-api/src/main.ts](../code/shop-api/src/main.ts)、[shop-api/package.json](../code/shop-api/package.json) |
| 配置校验（`.env` + Zod ↔ `config()`） | [shop-api/src/config/env.ts](../code/shop-api/src/config/env.ts) |
| Guard / Pipe / Interceptor / Filter 生命周期 | [shop-api/src/common/](../code/shop-api/src/common/)、[app.module.ts](../code/shop-api/src/app.module.ts) |
| Drizzle 同步驱动、事务、乐观锁 | [shop-api/src/order/order.repository.ts](../code/shop-api/src/order/order.repository.ts)、[shop-api/src/db/](../code/shop-api/src/db/) |
| 契约包（一处定义四端复用） | [packages/shared/src/](../code/packages/shared/src/) |
| TS 7 与工具链版本冲突的处置 | [tools/eslint-config/](../code/tools/eslint-config/)、[web-vue/package.json](../code/web-vue/package.json) |
| 生产化缺口与配方（Docker / pino / cluster / 指标） | 本章第 [15 章](15-生产化.md)；决策与生态地图见 [16 章](16-架构师视角.md) |
