/**
 * 金额：值对象 + 整数分
 *
 * PHP: new Money('199.90', 'CNY')（brick/money）或 bcmath；绝不会用 float 存钱。
 * JS : number 是 double，0.1 + 0.2 !== 0.3；BigInt 太重，不适合当日常类型。
 *      业界通行做法 = **整数分（cents）**，跟 PHP 里「金额存分为 int」一模一样。
 *
 * TS 侧的重点不是算法，而是「怎么让编译器帮你守住值对象」：
 * - class + private/# 字段 → 名义类型，别人无法伪造形状
 * - 只读字段 + 返回新实例 → 不可变值对象（≈ PHP 的 withXxx() / clone）
 * - 构造即校验 → 想跳过就只能调用 internal API（写不出来）
 */

const CURRENCY_RE = /^[A-Z]{3}$/;

/** 把 "199.9" / 199.9 / "199" 解析成整数分；只用字符串运算，不引入浮点误差。 */
export function parseDecimalToCents(input: string | number): number {
  const text = typeof input === "number" ? String(input) : input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new TypeError(`无法解析的金额: ${text}`);
  }
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (Number.isNaN(cents)) throw new TypeError(`无法解析的金额: ${text}`);
  return negative ? -cents : cents;
}

export class Money {
  readonly cents: number;
  readonly currency: string;

  constructor(cents: number, currency: string) {
    if (!Number.isInteger(cents)) {
      throw new TypeError(`金额必须是整数分，收到 ${cents}`);
    }
    if (!CURRENCY_RE.test(currency)) {
      throw new TypeError(`币种必须是 ISO 4217 三字母大写: ${currency}`);
    }
    this.cents = cents;
    this.currency = currency;
  }

  static of(amount: string | number, currency = "CNY"): Money {
    return new Money(parseDecimalToCents(amount), currency);
  }

  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  /** 不可变「修改」：永远返回新实例，和 PHP 值对象一致。 */
  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.cents + other.cents, this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.cents - other.cents, this.currency);
  }

  times(quantity: number): Money {
    if (!Number.isInteger(quantity)) {
      throw new TypeError(`数量必须是整数: ${quantity}`);
    }
    return new Money(this.cents * quantity, this.currency);
  }

  /** PHP 里 round($x, 2, PHP_ROUND_HALF_UP) 的等价实现：分级别的四舍五入。 */
  applyDiscount(ratePercent: number): Money {
    const discounted = Math.round(this.cents * (1 - ratePercent / 100));
    return new Money(discounted, this.currency);
  }

  compareTo(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.cents < other.cents) return -1;
    return this.cents > other.cents ? 1 : 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency === other.currency;
  }

  /** 展示用：分 → "199.90"。只在出口格式化，中间层始终是整数分。 */
  format(): string {
    const sign = this.cents < 0 ? "-" : "";
    const abs = Math.abs(this.cents);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")} ${this.currency}`;
  }

  toJSON(): string {
    return this.format();
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError(`币种不同: ${this.currency} vs ${other.currency}`);
    }
  }
}

/** 用整数分累加：不会出现浮点误差，等价于 PHP 里 array_sum 一堆 Money。 */
export function sumMoney(items: readonly Money[]): Money {
  if (items.length === 0) throw new TypeError("空列表无法求和，需要显式币种");
  const first = items[0]!;
  return items.reduce((acc, item) => acc.plus(item), Money.zero(first.currency));
}

/** 订单行小计：演示 times 的组合用法。 */
export function lineTotal(unitPrice: Money, quantity: number): Money {
  return unitPrice.times(quantity);
}
