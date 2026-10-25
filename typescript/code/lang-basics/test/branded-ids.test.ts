import { describe, expect, expectTypeOf, it } from "vitest";
import {
  buildCatalog,
  formatId,
  ownerOf,
  stockOf,
  toOrderId,
  toProductId,
  toUuid,
} from "../src/branded-ids.ts";
import type { OrderId, ProductId } from "../src/branded-ids.ts";

describe("branded type", () => {
  it("只有工厂函数能造出品牌值", () => {
    const productId = toProductId("3");
    expect(productId).toBe(3);
    expect(toProductId("0")).toBeNull();
    expect(toProductId(-1)).toBeNull();
    expect(toProductId("abc")).toBeNull();
    expect(toOrderId(7)).toBe(7);
    expect(toUuid("11111111-1111-1111-1111-111111111111")).toBeTypeOf("string");
    expect(toUuid("not-a-uuid")).toBeNull();
  });

  it("传错 id 类型直接编译失败", () => {
    const catalog = buildCatalog([[3 as ProductId, 12]]);
    expect(stockOf(3 as ProductId, catalog)).toBe(12);
    expect(stockOf(99 as ProductId, catalog)).toBe(0);

    const orders = new Map<OrderId, string>([[1 as OrderId, "ben"]]);
    expect(ownerOf(1 as OrderId, orders)).toBe("ben");
    // ownerOf(3 as ProductId, orders) // ← 编译失败：ProductId 不是 OrderId
    // const plain: ProductId = 5      // ← 编译失败：裸 number 不能当 ProductId
  });

  it("运行时仍然是裸值", () => {
    const id = toProductId(5) as ProductId;
    expect(typeof id).toBe("number");
    expect(formatId(id)).toBe("5");
    expectTypeOf(id).not.toEqualTypeOf<number>();
    expect([id].map(Number)).toEqual([5]);
  });
});
