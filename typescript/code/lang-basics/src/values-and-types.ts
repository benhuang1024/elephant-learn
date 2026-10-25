/**
 * 值与类型：PHP 人的第一反应为什么会出错
 *
 * PHP 对照：
 *   $n = 42;                      // 变量没有类型，值有类型
 *   declare(strict_types=1);      // 只影响标量参数强转，不影响变量本身
 *   gettype($n) / is_string($n)   // 运行时类型检查
 *
 * TypeScript 的关键认知：**类型只存在于编译期，运行时完全消失**（type erasure）。
 * `string` 不是类，`instanceof string` 为 false；运行时能依赖的只有 JS 自己的 typeof。
 */

export const answer = 42;

/** 参数类型写在参数名后面，返回值类型写在括号后面；PHP 的 `function f(int $x): string` 语序一致。 */
export function greet(name: string, times = 1): string {
  return `Hello, ${name}!`.repeat(times);
}

/** JS 只有 number 一种数字类型（IEEE 754 double），整数/浮点不区分，也没有 PHP_INT_MAX 溢出。 */
export function numberPitfalls(): Record<string, unknown> {
  return {
    sum: 0.1 + 0.2, // 0.30000000000000004 —— 和 PHP 的 float 一样，金额不要用 double
    intDiv: 7 / 2, // 3.5 —— `/` 永远是浮点除法，不像 PHP 8 的 intdiv()
    moduloOfNegative: -7 % 2, // -1 —— 与 PHP 的 % 一致（截断取余）
    nanNotEqualToSelf: selfEqual(Number.NaN), // false —— NaN 是唯一不等于自身的值
    // eslint-disable-next-line eqeqeq, no-constant-binary-expression -- 故意演示宽松相等：这就是这两条规则存在的原因
    looseEqualsNull: undefined == null, // true（=== 才是 false）—— 本仓库 eslint 强制 eqeqeq
    bigIntegerLiteral: 2n ** 64n, // BigInt，参与运算前必须加 n，且不能与 number 混算
  };
}

/** `typeof` 在 TS 里既是运行时 operator，也是类型运算符：`typeof x` 可以出现在类型位置。 */
export type AnswerType = typeof answer; // number

/** `x === x` 为 false 是判断 NaN 的经典写法（Number.isNaN 才是正解，linter 也会拦字面量比较）。 */
function selfEqual(value: number): boolean {
  return value === value;
}

/**
 * 字面量类型：PHP 没有对应物，是 TS 表达力的来源之一。
 * `const` 声明会推断字面量类型，`let` 会拓宽成宽类型 —— 与 PHP 的 gettype 无关，纯粹是编译器行为。
 */
export const mode = "fast" as const;
export type Mode = typeof mode; // "fast"

/** 元组 = 有长度和位置的数组类型，≈ PHP 的 list($a, $b) 解构，但类型是精确的。 */
export function moneyParts(totalCents: number): [yen: number, cents: number] {
  return [Math.floor(totalCents / 100), totalCents % 100];
}

/** 对象字面量的类型用 interface 或 type 别名；两者差异见 02 章，99% 场景用 interface。 */
export interface ProductView {
  sku: string;
  name: string;
  priceCents: number;
  tags?: readonly string[]; // readonly 数组 ≈ 只读列表，防止 push
}

/**
 * 结构化类型（structural typing）：只要形状匹配就算同一个类型，
 * 不需要像 PHP 那样显式 `implements`。这是与 Java/C# 名义类型最大的差别。
 */
export function describe(product: ProductView): string {
  return `${product.name} (${product.sku}) ¥${(product.priceCents / 100).toFixed(2)}`;
}

/** `as` ≈ PHP 的类型强转，但它只骗过编译器，不改变运行时值 —— 误用会埋雷，见 05 章 Zod。 */
export function unsafeCastExample(payload: unknown): ProductView {
  return payload as ProductView;
}

/** unknown vs any：PHP 的 mixed ≈ unknown（必须先收窄），而 any 是「闭嘴，别检查」。 */
export function acceptUnknown(value: unknown): string {
  if (typeof value === "string") return value.toUpperCase();
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/** node 24 原生支持类型擦除：`node scripts/hello.ts` 可直接运行，不需要 ts-node。 */
export function runtimeOnlyTruth(): string {
  const list = [1, 2, 3] as number[];
  return `编译期是 number[]，运行时只是 typeof list = ${typeof list} / Array.isArray = ${Array.isArray(list)}`;
}
