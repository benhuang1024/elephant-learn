import { describe, expect, expectTypeOf, it } from "vitest";
import { lineTotal, Money, parseDecimalToCents, sumMoney } from "../src/money.ts";

describe("金额值对象", () => {
  it("解析字符串小数不产生浮点误差", () => {
    expect(parseDecimalToCents("199.90")).toBe(19990);
    expect(parseDecimalToCents("0.1")).toBe(10);
    expect(parseDecimalToCents(12.345)).toBe(1234); // 截断到分，不四舍五入
    expect(parseDecimalToCents("-5")).toBe(-500);
    expect(() => parseDecimalToCents("199,90")).toThrow(TypeError);
    expect(() => parseDecimalToCents("abc")).toThrow(/无法解析的金额/);
  });

  it("构造即校验", () => {
    expect(() => new Money(199.5, "CNY")).toThrow(/整数分/);
    expect(() => new Money(100, "rmb")).toThrow(/ISO 4217/);
  });

  it("不可变运算返回新实例", () => {
    const a = Money.of("9.99");
    const b = Money.of("0.01");
    const sum = a.plus(b);
    expect(sum.cents).toBe(1000);
    expect(a.cents).toBe(999);
    expect(sum.format()).toBe("10.00 CNY");
    expect(a.minus(b).format()).toBe("9.98 CNY");
  });

  it("币种不同直接抛错，而不是静默换算", () => {
    expect(() => Money.of("1", "CNY").plus(Money.of("1", "USD"))).toThrow(/币种不同/);
    expect(Money.of("10", "EUR").compareTo(Money.of("5", "EUR"))).toBe(1);
    expect(Money.of("5", "EUR").equals(Money.of("5", "EUR"))).toBe(true);
  });

  it("折扣按分四舍五入", () => {
    expect(Money.of("199.99").applyDiscount(10).format()).toBe("179.99 CNY");
    expect(lineTotal(Money.of("19.90"), 3).format()).toBe("59.70 CNY");
  });

  it("累加一堆金额", () => {
    const totals = sumMoney([Money.of("0.1"), Money.of("0.2")]);
    expect(totals.cents).toBe(30); // 浮点写法会得到 30.000000000000004 之类的脏值
    expectTypeOf(totals).toEqualTypeOf<Money>();
    expect(() => sumMoney([])).toThrow(/空列表/);
  });

  it("JSON 序列化走 format()", () => {
    expect(JSON.stringify({ price: Money.of("1234.5") })).toBe('{"price":"1234.50 CNY"}');
  });
});
