import { describe, expect, it } from "vitest";
import { PlaceOrderRequestSchema, ProductResponseSchema } from "@shop/shared";
import { ApiProblem, formatAmount } from "../src/api";

/**
 * 前端的测试：这一层最值得测的是「边界」——schema 与格式化函数，
 * 而不是 DOM。真要测组件需要 @testing-library + jsdom（docs/11 结尾说明为什么这里不装）。
 */
describe("前端边界逻辑", () => {
  it("金额格式化不做浮点运算", () => {
    expect(formatAmount("1299.00")).toBe("¥1,299.00");
    expect(formatAmount("0.05")).toBe("¥0.05");
  });

  it("响应 schema 把 number 金额收回字符串类型", () => {
    const parsed = ProductResponseSchema.parse({
      id: 1,
      sku: "SKU-001",
      name: "机械键盘",
      price: 599,
      stock: 20,
      version: 0,
    });
    expect(parsed.price).toBe("599.00");
  });

  it("下单请求在客户端就先被 schema 拦住（少一次无用的往返）", () => {
    expect(() => PlaceOrderRequestSchema.parse({ customerName: "ben", items: [] })).toThrow();
    expect(() =>
      PlaceOrderRequestSchema.parse({
        customerName: "ben",
        items: [{ productId: 1, quantity: 100 }],
      }),
    ).toThrow(/99/);
  });

  it("ApiProblem 带 title 与字段错误", () => {
    const problem = new ApiProblem(409, "库存不足", "库存不足 sku=SKU-003 需要=3 剩余=2", {
      items: "不能为空",
    });
    expect(problem.status).toBe(409);
    expect(problem.title).toBe("库存不足");
    expect(problem.fieldErrors["items"]).toBe("不能为空");
  });
});
