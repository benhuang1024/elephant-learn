import { describe, expect, expectTypeOf, it } from "vitest";
import {
  addDecimal,
  centsToDecimal,
  compareDecimal,
  decimalToCents,
  DecimalInputSchema,
  parseDecimal,
  PositiveAmountSchema,
  sumDecimal,
  ZERO_AMOUNT,
  type DecimalAmount,
} from "../src/index.js";

describe("定点小数金额", () => {
  it("解析并规范化到两位小数", () => {
    expect(parseDecimal("1999.00")).toBe("1999.00");
    expect(parseDecimal(599)).toBe("599.00");
    expect(parseDecimal("599.5")).toBe("599.50");
    expect(parseDecimal("0.1")).toBe("0.10");
    expect(parseDecimal("-5")).toBe("-5.00");
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("1.234")).toBeNull(); // 超过 2 位小数
    expect(parseDecimal("12345678901")).toBeNull(); // 整数位超过 10 位
    expect(parseDecimal("1e3")).toBeNull();
    expect(parseDecimal(Number.NaN)).toBeNull();
  });

  it("分与字符串互转", () => {
    expect(decimalToCents("1999.00" as DecimalAmount)).toBe(199900);
    expect(centsToDecimal(199900)).toBe("1999.00");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(-250)).toBe("-2.50");
    expect(() => centsToDecimal(1.5)).toThrow(TypeError);
  });

  it("加减比较全走整数分，没有浮点尾巴", () => {
    const a = parseDecimal("0.10") as DecimalAmount;
    const b = parseDecimal("0.20") as DecimalAmount;
    expect(addDecimal(a, b)).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3); // 反面对照：直接用 number 就会翻车
    expect(compareDecimal(a, b)).toBe(-1);
    expect(compareDecimal("5.00" as DecimalAmount, "5.00" as DecimalAmount)).toBe(0);
    expect(sumDecimal([a, b, "1.00" as DecimalAmount])).toBe("1.30");
    expect(ZERO_AMOUNT).toBe("0.00");
  });

  it("入站 schema 同时接受 number 和 string", () => {
    expect(DecimalInputSchema.parse(1999)).toBe("1999.00");
    expect(DecimalInputSchema.parse("1999.0")).toBe("1999.00");
    expect(() => DecimalInputSchema.parse(true)).toThrow();
    expect(() => DecimalInputSchema.parse("1.999")).toThrow(/最多两位小数/);
    expect(PositiveAmountSchema.parse(0.01)).toBe("0.01");
    const failure = PositiveAmountSchema.safeParse(0);
    expect(failure.success).toBe(false);
    if (!failure.success) expect(failure.error.issues[0]?.message).toBe("必须大于或等于 0.01");
  });

  it("推导类型是品牌字符串而不是 number", () => {
    const parsed = PositiveAmountSchema.parse(1);
    expectTypeOf(parsed).toEqualTypeOf<DecimalAmount>();
    // 品牌类型「兼容 string」但不「等于 string」，这正是它能挡住误用的原因
    expectTypeOf(parsed).toMatchTypeOf<string>();
    expectTypeOf<string>().not.toEqualTypeOf<DecimalAmount>();
    expect(parsed).toBe("1.00");
    // const wrong: DecimalAmount = 1 // 编译失败
  });
});
