import { describe, expect, it } from "vitest";
import { PlaceOrderRequestSchema, ProductResponseSchema } from "@shop/shared";
import { ApiProblem, formatAmount } from "../src/lib/api";

/**
 * Next 项目里最适合测的仍然是「纯函数 + schema」。
 * Server Component / Server Action 的测试需要额外工具（next 官方推荐 Playwright 做 e2e），
 * 这里不引入，docs/13 会说明取舍。
 */
describe("Next 数据层", () => {
  it("金额格式化", () => {
    expect(formatAmount("1299.00")).toBe("¥1,299.00");
  });

  it("响应 schema 在 SSR 里同样把数字金额收回收紧类型", () => {
    const product = ProductResponseSchema.parse({
      id: 3,
      sku: "SKU-003",
      name: "限量版鼠标",
      price: 399,
      stock: 2,
      version: 0,
    });
    expect(product.price).toBe("399.00");
  });

  it("FormData → 请求体：非法数量被 schema 拦下", () => {
    expect(() =>
      PlaceOrderRequestSchema.parse({
        customerName: "ben",
        items: [{ productId: Number("abc"), quantity: 1 }],
      }),
    ).toThrow();
  });

  it("ApiProblem 保留 problem+json 的 title", () => {
    const problem = new ApiProblem(401, "未认证", "需要 HTTP Basic 认证");
    expect(problem.title).toBe("未认证");
    expect(problem.status).toBe(401);
  });
});
