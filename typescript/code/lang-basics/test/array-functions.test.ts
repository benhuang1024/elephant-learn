import { describe, expect, it } from "vitest";
import {
  arrayFunctionTour,
  destructureDemo,
  findBySku,
  groupByStock,
  groupByNameLength,
  hasSku,
  inStock,
  naiveNumberSort,
  objectIteration,
  restock,
  rows,
  shallowVsDeep,
  sortByPrice,
} from "../src/array-functions.ts";

describe("数组函数对照", () => {
  it("map / reduce / unique / length", () => {
    expect(arrayFunctionTour()).toMatchObject({
      names: ["键盘", "鼠标", "显示器"],
      total: 239700,
      unique: ["SKU-1", "SKU-2"],
      indexes: [0, 1, 2],
    });
  });

  it("filter 必须写显式条件", () => {
    expect(inStock().map((r) => r.sku)).toEqual(["SKU-1", "SKU-3"]);
    // 反例：rows.filter(r => r.stock) 也会保留 stock 为负的行，但会把 0 过滤掉
    expect(rows.filter((r) => r.stock)).toHaveLength(2);
  });

  it("find 返回 undefined 而不是 false", () => {
    expect(findBySku("SKU-3")?.name).toBe("显示器");
    expect(findBySku("NOPE")).toBeUndefined();
    expect(hasSku("SKU-2")).toBe(true);
  });

  it("reduce 分组 / Object.groupBy", () => {
    expect(groupByStock()).toEqual({ in: ["SKU-1", "SKU-3"], out: ["SKU-2"] });
    expect(groupByNameLength()["3"]).toEqual([rows[2]]);
  });

  it("sort 原地改 + 默认字典序", () => {
    expect(sortByPrice(rows, "desc").map((r) => r.sku)).toEqual(["SKU-3", "SKU-1", "SKU-2"]);
    expect(rows.map((r) => r.sku)).toEqual(["SKU-1", "SKU-2", "SKU-3"]); // 原数组没被改
    // 不给比较函数就是字典序：10 排在 2 前面
    expect(naiveNumberSort([2, 10, 1]).map(String)).toEqual(["1", "10", "2"]);
  });

  it("解构与不可变更新", () => {
    expect(destructureDemo()).toMatchObject({ first: 1, rest: [2, 3, 4], sku: "SKU-1" });
    const updated = restock("SKU-2", 5);
    expect(findBySku("SKU-2", updated)?.stock).toBe(5);
    expect(findBySku("SKU-2", rows)?.stock).toBe(0);
  });

  it("对象迭代三件套", () => {
    const iterated = objectIteration();
    expect(iterated["keys"]).toEqual(["host", "port", "dbname"]);
    expect(iterated["has"]).toBe(true);
    expect((iterated["entries"] as [string, unknown][])[1]).toEqual(["port", 3306]);
  });

  it("浅拷贝共享元素对象，深拷贝才隔离", () => {
    expect(shallowVsDeep()).toEqual({ originalStock: 999, deepStock: 12 });
  });
});
