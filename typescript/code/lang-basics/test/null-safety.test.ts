import { describe, expect, expectTypeOf, it } from "vitest";
import {
  buildQuery,
  cityOf,
  fallbackDemo,
  findById,
  mutateDefaults,
  riskyFirstLine,
  safeSum,
  secondOrNone,
} from "../src/null-safety.ts";

describe("null 与 undefined", () => {
  it("find 返回可空，必须收窄", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(findById(2, rows)).toEqual({ id: 2 });
    expect(findById(9, rows)).toBeUndefined();
    expectTypeOf(findById(1, rows)).toEqualTypeOf<{ id: number } | undefined>();
  });

  it("可选参数解构默认值需要外层 = {}", () => {
    expect(buildQuery("键盘")).toBe("q=%E9%94%AE%E7%9B%98&page=1&size=20");
    expect(buildQuery("a", { page: 3 })).toBe("q=a&page=3&size=20");
  });

  it("可选链 + ?? 兜底", () => {
    expect(cityOf({})).toBe("未知城市");
    expect(cityOf({ profile: null })).toBe("未知城市");
    expect(cityOf({ profile: { address: { city: "上海" } } })).toBe("上海");
  });

  it("?? 与 || 的区别就是 0 和空字符串", () => {
    expect(fallbackDemo({ count: 0 })).toEqual({
      withNullish: 0,
      withLogicalOr: 10,
      emptyLabel: "",
    });
    expect(fallbackDemo({ count: 5, label: "x" }).withNullish).toBe(5);
  });

  it("??= 只在 null/undefined 时赋值", () => {
    const config = { retries: 0 };
    expect(mutateDefaults(config)).toBe(0);
    expect(mutateDefaults({})).toBe(3);
  });

  it("正则捕获组配合 ! 断言", () => {
    expect(riskyFirstLine("hello world")).toBe("hello");
    expect(riskyFirstLine(null)).toBe("");
  });

  it("循环收窄累加", () => {
    expect(safeSum([1, null, 2, undefined, 3])).toBe(6);
    expect(safeSum([])).toBe(0);
  });

  it("noUncheckedIndexedAccess 让越界变成 undefined", () => {
    expect(secondOrNone(["a"])).toBeUndefined();
    expectTypeOf(secondOrNone(["a", "b"])).toEqualTypeOf<string | undefined>();
  });
});
