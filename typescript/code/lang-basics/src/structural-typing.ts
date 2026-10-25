/**
 * 结构化类型 vs 名义类型
 *
 * PHP / Java 是名义类型：`$x instanceof Order` 看类名和继承关系。
 * TS 是结构化类型：只看形状（成员和类型），形状匹配就算同一个类型。
 *
 * 后果：
 * 1. 你可以给任何库的类型「补一个兼容实现」，不需要 implements。
 * 2. 两个不相干的 interface 只要字段一样，可以互相赋值 —— 想区分就要加 brand（见 branded-ids.ts）。
 * 3. 多余字段会被「 excess property check 」拦下，但只在字面量直接赋值时。
 */

export interface MoneyLike {
  amount: number;
  currency: string;
}

/** 没有任何 implements / extends 关系，但形状包含 MoneyLike，所以可以当 MoneyLike 用。 */
export interface PriceTag {
  amount: number;
  currency: string;
  label: string;
}

export function total(items: readonly MoneyLike[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

export function moneyOf(tag: PriceTag): MoneyLike {
  return tag; // 结构化赋值：允许
}

/**
 * 可选属性带来的「宽窄」差异：`{a?: number}` 与 `{a: number | undefined}` 在
 * exactOptionalPropertyTypes 关闭时几乎等价，PHP 的 `$x = null` 语义更接近后者。
 */
export interface Filters {
  q?: string;
  page?: number;
}

export function withDefaults(filters: Filters, defaults: Required<Filters>): Required<Filters> {
  return { q: filters.q ?? defaults.q, page: filters.page ?? defaults.page };
}

/**
 * 函数类型也是结构化的：参数按「逆变」比较，返回按「协变」比较。
 * 少写参数是可以的 —— PHP 里对应 array_map 传一个只接收 1 个参数的闭包。
 */
export type Caster = (value: string) => unknown;

export function applyAll(values: readonly string[], caster: Caster): unknown[] {
  return values.map(caster);
}

/** class 也是类型；private 字段是编译期可见性，运行时仍然可读（用 # 才是真私有）。 */
export class Counter {
  readonly name: string;
  private value = 0;

  constructor(name: string) {
    this.name = name;
  }

  increment(step = 1): number {
    this.value += step;
    return this.value;
  }

  peek(): number {
    return this.value;
  }
}

/**
 * 名义类型的替代品：private / # 成员会让结构比较失败，
 * 于是 Counter 就变成「只有自己能赋值给自己」的名义类型。
 */
export function acceptCounter(c: Counter): number {
  return c.increment();
}
