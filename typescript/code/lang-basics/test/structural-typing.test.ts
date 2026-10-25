import { describe, expect, it } from "vitest";
import { expectTypeOf } from "vitest";
import {
  acceptCounter,
  applyAll,
  Counter,
  moneyOf,
  total,
  withDefaults,
} from "../src/structural-typing.ts";
import type { Caster, Filters, MoneyLike, PriceTag } from "../src/structural-typing.ts";

describe("结构化类型", () => {
  it("形状匹配即可赋值，不需要 implements", () => {
    const tag: PriceTag = { amount: 199, currency: "CNY", label: "显示器" };
    expect(moneyOf(tag).amount).toBe(199);
    expect(total([tag, { amount: 1, currency: "CNY" }])).toBe(200);
    expectTypeOf(tag).toMatchTypeOf<MoneyLike>();
  });

  it("字面量直接赋值时多余字段会被拒绝", () => {
    const ok: MoneyLike = { amount: 1, currency: "CNY" };
    expect(total([ok])).toBe(1);
    // 下面这行如果取消注释会编译失败：'label' 不在 MoneyLike 里
    // const bad: MoneyLike = { amount: 1, currency: "CNY", label: "x" };
  });

  it("可选属性与默认值合并", () => {
    const merged = withDefaults({ page: 3 } satisfies Filters, { q: "", page: 1 });
    expect(merged).toEqual({ q: "", page: 3 });
    expectTypeOf(merged).toEqualTypeOf<{ q: string; page: number }>();
  });

  it("函数参数可以少写", () => {
    const upper: Caster = (v) => v.toUpperCase();
    expect(applyAll(["a", "b"], upper)).toEqual(["A", "B"]);
    // 只接收 0 个参数的函数也是合法的 Caster
    expect(applyAll(["a", "b"], () => "x")).toEqual(["x", "x"]);
  });

  it("private 字段带来名义类型效果", () => {
    const a = new Counter("a");
    expect(acceptCounter(a)).toBe(1);
    expect(new Counter("b").peek()).toBe(0);
    // const structurallySame = { name: "x" } —— 不能当 Counter 用
  });
});
