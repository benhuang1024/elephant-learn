import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertTransition,
  canTransition,
  describeLegacy,
  labelOf,
  LegacyCode,
  ORDER_STATUSES,
  parseStatus,
} from "../src/enum-vs-union.ts";
import type { FromList, OrderStatus } from "../src/enum-vs-union.ts";

describe("字面量联合（推荐写法）", () => {
  it("值域和类型同步", () => {
    expect(ORDER_STATUSES).toContain("pending");
    expectTypeOf<"pending">().toMatchTypeOf<OrderStatus>();
    expectTypeOf(ORDER_STATUSES).toEqualTypeOf<
      readonly ["pending", "paid", "shipped", "cancelled", "refunded"]
    >();
    expectTypeOf<FromList>().toEqualTypeOf<OrderStatus>();
  });

  it("标签映射不会漏状态", () => {
    for (const status of ORDER_STATUSES) {
      expect(labelOf(status)).toBeTypeOf("string");
    }
    expect(labelOf("refunded")).toBe("已退款");
  });

  it("状态机迁移表", () => {
    expect(canTransition("pending", "paid")).toBe(true);
    expect(canTransition("pending", "shipped")).toBe(false);
    expect(canTransition("shipped", "refunded")).toBe(true);
    expect(() => assertTransition("cancelled", "paid")).toThrow(/不允许的状态迁移/);
  });

  it("外部字符串必须显式解析", () => {
    expect(parseStatus("paid")).toBe("paid");
    expect(() => parseStatus("PAID")).toThrow(/未知订单状态/);
  });
});

describe("内置 enum 的历史包袱", () => {
  it("编译成带双向映射的对象", () => {
    expect(LegacyCode.Ok).toBe(0);
    expect(LegacyCode.NotFound).toBe(404);
    expect(describeLegacy(LegacyCode.Busy)).toBe("busy");
    // 这就是「数字 enum 不安全」的证据：反向映射存在，且任意数字能被断言进来
    expect(LegacyCode[404]).toBe("NotFound");
    expect(describeLegacy(999 as LegacyCode)).toBeUndefined();
  });

  it("as 断言绕过检查", () => {
    expect(() => parseStatus("nope")).toThrow();
    // legacyHole() 返回 999，运行时没有任何东西阻止它
  });
});
