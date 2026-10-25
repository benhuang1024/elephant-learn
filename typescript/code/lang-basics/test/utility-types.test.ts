import { describe, expect, expectTypeOf, it } from "vitest";
import { loadProduct, TypedEventBus } from "../src/utility-types.ts";
import type {
  ApiPath,
  Complete,
  DeepReadonly,
  FirstOf,
  NewProduct,
  OrderWithItems,
  ProductListItem,
  ProductPatch,
  ProductResult,
  Route,
  ShopEvents,
  Unwrap,
} from "../src/utility-types.ts";

describe("工具类型", () => {
  it("Partial / Pick / Omit 派生 DTO", () => {
    const patch: ProductPatch = { priceCents: 100 };
    expect(patch).toEqual({ priceCents: 100 });
    expectTypeOf<ProductListItem>().toEqualTypeOf<{
      id: number;
      sku: string;
      name: string;
      priceCents: number;
    }>();
    expectTypeOf<keyof NewProduct>().toEqualTypeOf<
      "sku" | "name" | "priceCents" | "stock" | "description"
    >();
  });

  it("Readonly 只作用于第一层，DeepReadonly 自己写", () => {
    type Box = { value: { nested: number } };
    expectTypeOf<Readonly<Box>>().toEqualTypeOf<{ readonly value: { nested: number } }>();
    expectTypeOf<DeepReadonly<Box>>().toEqualTypeOf<{
      readonly value: { readonly nested: number };
    }>();
  });

  it("Required / Complete 去掉可选", () => {
    expectTypeOf<Required<{ a?: number; b?: string }>>().toEqualTypeOf<{
      a: number;
      b: string;
    }>();
    expectTypeOf<Complete<{ a?: number }>>().toEqualTypeOf<{ a: number }>();
  });

  it("模板字面量类型把字符串变类型", () => {
    const path: ApiPath = "/api/products/1";
    const route: Route = "GET /api/products";
    expect([path, route]).toEqual(["/api/products/1", "GET /api/products"]);
    expectTypeOf<"POST /api/products/9">().toMatchTypeOf<Route>();
    // const bad: Route = "PATCH /api/products" // 编译失败
  });

  it("infer 与 Awaited 解包", () => {
    expectTypeOf<FirstOf<[string, number]>>().toEqualTypeOf<string>();
    expectTypeOf<Unwrap<Promise<Promise<number>>>>().toEqualTypeOf<Promise<number>>();
    expectTypeOf<ProductResult>().toEqualTypeOf<
      | {
          id: number;
          sku: string;
          name: string;
          priceCents: number;
          stock: number;
          description?: string;
          createdAt: string;
        }
      | undefined
    >();
  });

  it("类型测试也可以跑运行时断言", async () => {
    expect(await loadProduct(3)).toMatchObject({ id: 3 });
    expect(await loadProduct(0)).toBeUndefined();
    expectTypeOf<ShopEvents["stockLow"]>().toEqualTypeOf<{ sku: string; stock: number }>();
  });

  it("WithRelations 交叉类型", () => {
    const order: OrderWithItems = { id: 1 };
    expect(order.id).toBe(1);
    expectTypeOf(order.items).toEqualTypeOf<ProductListItem[] | undefined>();
  });

  it("TypedEventBus 的事件名与载荷绑定", () => {
    const seen: unknown[] = [];
    const bus = new TypedEventBus();
    bus.on("stockLow", (payload) => seen.push(payload.sku));
    bus.emit("stockLow", { sku: "SKU-3", stock: 1 });
    expect(seen).toEqual(["SKU-3"]);
    // 下面这行会编译失败：payload 形状必须是 { sku, stock }
    // bus.emit("stockLow", { sku: "SKU-3" });
  });
});
