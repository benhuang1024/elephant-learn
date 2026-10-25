import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertDefined,
  describeSource,
  head,
  isApiError,
  next,
  stockRules,
  stringifyLoose,
} from "../src/narrowing-and-unions.ts";
import type { OrderEvent, OrderState } from "../src/narrowing-and-unions.ts";

describe("typeof / in 收窄", () => {
  it("union 参数在收窄后各自可用", () => {
    expect(stringifyLoose(599)).toBe("599.00");
    expect(stringifyLoose("599.00")).toBe("599.00");
    // 收窄之前 toFixed 不存在：这一行如果去掉 typeof 判断就编译失败
    expectTypeOf(stringifyLoose).parameter(0).toEqualTypeOf<string | number>();
  });

  it("== null 一次覆盖 null 与 undefined", () => {
    expect(head(null)).toBeUndefined();
    expect(head(undefined)).toBeUndefined();
    expect(head([])).toBeUndefined();
    expect(head([1, 2])).toBe(1);
  });

  it("in 运算符区分两个形状", () => {
    expect(describeSource({ url: "https://a.dev" })).toBe("网络资源 https://a.dev");
    expect(describeSource({ filePath: "/tmp/a.csv" })).toBe("本地文件 /tmp/a.csv");
  });
});

describe("可辨识联合 + 穷尽检查", () => {
  it("合法迁移按 kind 走对应分支", () => {
    const placed: OrderState = next("NEW", { kind: "placed", customer: "n-01" });
    expect(placed).toBe("NEW");
    expect(next(placed, { kind: "paid", amountCents: 59900 })).toBe("PAID");
    expect(next("PAID", { kind: "shipped", trackingNo: "SF1" })).toBe("SHIPPED");
    expect(next("PAID", { kind: "cancelled", reason: "用户取消" })).toBe("CANCELLED");
  });

  it("非法迁移在运行时抛出（编译期靠 never 兜底）", () => {
    expect(() => next("SHIPPED", { kind: "paid", amountCents: 1 })).toThrow(/非法状态迁移/);
    expect(() => next("SHIPPED", { kind: "cancelled", reason: "太晚了" })).toThrow(/非法状态迁移/);
  });

  it("事件类型本身是 union，构造不出未声明的 kind", () => {
    const events: OrderEvent[] = [
      { kind: "placed", customer: "c" },
      { kind: "paid", amountCents: 1 },
    ];
    expect(events.map((e) => e.kind)).toEqual(["placed", "paid"]);
    // 判别字段收窄后，各分支负载字段互不可见（events[0] 会带上 | undefined，所以这里直接用字面量）
    const first: OrderEvent = { kind: "placed", customer: "c" };
    if (first.kind === "placed") expect(first.customer).toBe("c");
  });
});

describe("类型守卫与 asserts", () => {
  it("isApiError 只认结构", () => {
    expect(isApiError({ message: "boom", status: 500 })).toBe(true);
    expect(isApiError({ message: "boom" })).toBe(false);
    expect(isApiError("boom")).toBe(false);
    expect(isApiError(null)).toBe(false);
    const raw: unknown = { message: "not found", status: 404 };
    if (isApiError(raw)) {
      // 守卫之后 raw.status 是 number，不是 unknown
      expectTypeOf(raw.status).toEqualTypeOf<number>();
      expect(raw.status).toBe(404);
    }
  });

  it("asserts 函数把可选变成必选", () => {
    const maybe: string | undefined = "ok";
    assertDefined(maybe, "值");
    expectTypeOf(maybe).toEqualTypeOf<string>();
    expect(() => assertDefined(undefined, "库存")).toThrow(/库存 不存在/);
  });

  it("satisfies 校验形状但保留字面量类型", () => {
    expect(stockRules.low.max).toBe(10);
    // satisfies 不像 `:` 那样把类型拓宽成 Record<string, ...>：键仍是字面量
    expectTypeOf(stockRules.low).toHaveProperty("min");
    expect(Object.keys(stockRules)).toEqual(["low", "normal"]);
  });
});
