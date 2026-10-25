import { describe, expect, it } from "vitest";
import {
  acceptUnknown,
  answer,
  describe as describeProduct,
  greet,
  moneyParts,
  numberPitfalls,
  runtimeOnlyTruth,
  unsafeCastExample,
} from "../src/values-and-types.ts";
import type { ProductView } from "../src/values-and-types.ts";
import { expectTypeOf } from "vitest";

describe("值与类型", () => {
  it("函数签名是编译期约束", () => {
    expect(greet("ben")).toBe("Hello, ben!");
    expect(greet("ben", 2)).toBe("Hello, ben!Hello, ben!");
    expectTypeOf(greet).parameters.toEqualTypeOf<[name: string, times?: number]>();
    expectTypeOf(answer).toBeNumber();
  });

  it("number 的坑与 PHP float 同源", () => {
    const p = numberPitfalls();
    expect(p.sum).toBeCloseTo(0.3, 10);
    expect(p.sum).not.toBe(0.3);
    expect(p.intDiv).toBe(3.5);
    expect(p.moduloOfNegative).toBe(-1);
    expect(p.nanNotEqualToSelf).toBe(false);
    expect(p.looseEqualsNull).toBe(true);
    expect(p.bigIntegerLiteral).toBe(18446744073709551616n);
  });

  it("元组返回值可以按位置解构", () => {
    const [yen, cents] = moneyParts(199_99);
    expect([yen, cents]).toEqual([199, 99]);
    expectTypeOf(yen).toBeNumber();
  });

  it("结构化类型：不需要 implements 也能传", () => {
    const duck = { sku: "SKU-1", name: "键盘", priceCents: 29900 };
    expect(describeProduct(duck)).toBe("键盘 (SKU-1) ¥299.00");
  });

  it("as 只骗编译器，运行时字段一个都不会多出", () => {
    const fake = unsafeCastExample({ totally: "wrong" });
    expect(fake.sku).toBeUndefined();
    expect(fake.name).toBeUndefined();
  });

  it("unknown 必须先收窄，才能变成值", () => {
    expect(acceptUnknown("php")).toBe("PHP");
    expect(acceptUnknown(7)).toBe("7");
    expect(acceptUnknown({ a: 1 })).toBe('{"a":1}');
  });

  it("类型在运行时消失", () => {
    expect(runtimeOnlyTruth()).toContain("typeof list = object");
    const product: ProductView = { sku: "s", name: "n", priceCents: 1 };
    expect(Object.keys(product)).toEqual(["sku", "name", "priceCents"]);
  });
});
