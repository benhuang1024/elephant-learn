import { describe, expect, expectTypeOf, it } from "vitest";
import {
  andThen,
  AppError,
  caughtMessage,
  describeThrowable,
  err,
  InsufficientStockException,
  mapResult,
  NotFoundException,
  ok,
  reserve,
  tryInto,
  unwrapOr,
  wrapWithCause,
} from "../src/error-handling.ts";

describe("异常层级", () => {
  it("子类带上 status 与 problem+json 附加字段", () => {
    const error = new InsufficientStockException("SKU-3", 3, 1);
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(409);
    expect(error.extras).toEqual({ sku: "SKU-3", requested: 3, available: 1 });
    expect(describeThrowable(error)).toBe("InsufficientStockException(409): 商品 SKU-3 库存不足");
    expect(new NotFoundException("商品", 7).status).toBe(404);
    expect(caughtMessage("只是字符串")).toBe("只是字符串");
    expect(caughtMessage(new Error("有 message"))).toBe("有 message");
  });

  it("throw 任何东西都合法，所以先收窄再用", () => {
    for (const thrown of ["bare string", 42, null, { a: 1 }]) {
      expect(() => {
        throw thrown;
      }).toThrow();
    }
    expect(describeThrowable("bare string")).toBe("string thrown: bare string");
    expect(describeThrowable(undefined)).toBe("thrown: undefined");
  });

  it("异常链保留 cause", () => {
    try {
      wrapWithCause();
      expect.unreachable("应该抛出");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).message).toBe("下单失败");
      expect((error as Error).cause).toBeInstanceOf(Error);
      expect(((error as Error).cause as Error).message).toBe("数据库连接超时");
    }
  });
});

describe("Result 类型", () => {
  it("可预期失败走返回值，编译器逼你分支", () => {
    const good = reserve(10, 4);
    expect(good.ok && good.value).toBe(6);
    const bad = reserve(2, 5);
    expect(bad.ok).toBe(false);
    expectTypeOf(good).toEqualTypeOf<Result<number, InsufficientStockException>>();
  });

  it("map / andThen / unwrapOr", () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    expect(mapResult(err("nope" as never), (n: number) => n)).toEqual({ ok: false, error: "nope" });
    expect(andThen(ok(1), (n) => ok(n + 1))).toEqual({ ok: true, value: 2 });
    expect(unwrapOr(err("x" as never), "fallback")).toBe("fallback");
  });

  it("tryInto 把 throw 转成 Result", () => {
    expect(tryInto(() => 1 / 2)).toEqual({ ok: true, value: 0.5 });
    const wrapped = tryInto(() => {
      throw new Error("同步炸了");
    });
    expect(wrapped.ok).toBe(false);
    if (!wrapped.ok) {
      expect(wrapped.error.status).toBe(500);
      expect(wrapped.error.message).toBe("同步炸了");
    }
    const app = tryInto(() => {
      const reserved = reserve(1, 9);
      if (!reserved.ok) throw reserved.error;
      return reserved.value;
    });
    expect(app.ok).toBe(false);
    if (!app.ok) expect(app.error).toBeInstanceOf(InsufficientStockException);
  });
});

// 类型导入用于 expectTypeOf
import type { Result } from "../src/error-handling.ts";
