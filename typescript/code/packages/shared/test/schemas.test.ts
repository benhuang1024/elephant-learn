import { describe, expect, it } from "vitest";
import {
  CreateProductRequestSchema,
  hasSearchTerm,
  insufficientStockProblem,
  optimisticLockProblem,
  PlaceOrderRequestSchema,
  ProductQuerySchema,
  ProductResponseSchema,
  toFieldErrors,
  UpdateProductRequestSchema,
  validationProblem,
  OrderResponseSchema,
  notFoundProblem,
  conflictProblem,
  dataIntegrityProblem,
  badRequestProblem,
  localIsoDateTime,
} from "../src/index.js";

describe("商品 schema", () => {
  it("README 里的 curl 请求体可以原样解析", () => {
    const parsed = CreateProductRequestSchema.parse({
      sku: "SKU-100",
      name: "显示器",
      price: 1999.0,
      stock: 3,
    });
    expect(parsed).toEqual({ sku: "SKU-100", name: "显示器", price: "1999.00", stock: 3 });
  });

  it("缺省 stock 变成 0，与 Java 的 primitive int 一致", () => {
    expect(CreateProductRequestSchema.parse({ sku: "S", name: "N", price: 1 }).stock).toBe(0);
  });

  it("未知字段被忽略（Boot 的 FAIL_ON_UNKNOWN_PROPERTIES=false 同义）", () => {
    const parsed = CreateProductRequestSchema.parse({
      sku: "S",
      name: "N",
      price: 1,
      stock: 1,
      hackMe: true,
    });
    expect("hackMe" in parsed).toBe(false);
  });

  it("校验消息按字段路径拍平，第一条胜出", () => {
    const failure = CreateProductRequestSchema.safeParse({ sku: "", name: "", price: -1, stock: 0 });
    expect(failure.success).toBe(false);
    if (failure.success) return;
    const errors = toFieldErrors(failure.error);
    expect(errors["sku"]).toBe("不能为空");
    expect(errors["name"]).toBe("不能为空");
    expect(errors["price"]).toBeDefined();
    expect(Object.keys(errors)).toEqual(["sku", "name", "price"]);
  });

  it("更新 DTO 不接受 sku", () => {
    const parsed = UpdateProductRequestSchema.parse({ name: "机械键盘", price: "599", stock: 20 });
    expect(parsed).toEqual({ name: "机械键盘", price: "599.00", stock: 20 });
  });

  it("响应 schema 把 number 金额变成定点字符串", () => {
    const product = ProductResponseSchema.parse({
      id: 1,
      sku: "SKU-001",
      name: "机械键盘",
      price: 599,
      stock: 20,
      version: 0,
    });
    expect(product.price).toBe("599.00");
    expect(product.id).toBe(1);
  });

  it("查询参数只认 q，空白视为未填", () => {
    expect(ProductQuerySchema.parse({ q: "键盘" })).toEqual({ q: "键盘" });
    expect(hasSearchTerm(ProductQuerySchema.parse({ q: "   " }))).toBe(false);
    expect(hasSearchTerm(ProductQuerySchema.parse({}))).toBe(false);
    expect(ProductQuerySchema.parse({ page: 2 })).toEqual({});
  });
});

describe("订单 schema", () => {
  const valid = {
    customerName: "ben",
    items: [
      { productId: 1, quantity: 3 },
      { productId: 3, quantity: 1 },
    ],
  };

  it("下单请求解析成推导类型", () => {
    expect(PlaceOrderRequestSchema.parse(valid)).toEqual(valid);
  });

  it("嵌套字段错误路径带下标", () => {
    const failure = PlaceOrderRequestSchema.safeParse({
      customerName: "ben",
      items: [{ productId: 0, quantity: 0 }],
    });
    expect(failure.success).toBe(false);
    if (failure.success) return;
    const errors = toFieldErrors(failure.error);
    expect(errors["items[0].productId"]).toBeDefined();
    expect(errors["items[0].quantity"]).toBe("必须大于或等于 1");
  });

  it("空购物车 / 超过 20 行", () => {
    expect(toFieldErrors(PlaceOrderRequestSchema.safeParse({ customerName: "b", items: [] }).error!)[
      "items"
    ]).toBe("不能为空");
    const tooMany = {
      customerName: "b",
      items: Array.from({ length: 21 }, () => ({ productId: 1, quantity: 1 })),
    };
    expect(PlaceOrderRequestSchema.safeParse(tooMany).success).toBe(false);
  });

  it("订单响应形状与 Java 一致", () => {
    const order = OrderResponseSchema.parse({
      id: 7,
      customerName: "ben",
      status: "PENDING",
      total: 1797.0,
      createdAt: "2026-10-25T09:33:41.123",
      version: 0,
      items: [
        { productId: 1, sku: "SKU-001", unitPrice: 599.0, quantity: 3, subtotal: 1797.0 },
      ],
    });
    expect(order.total).toBe("1797.00");
    expect(order.items[0]?.subtotal).toBe("1797.00");
    expect(order.status).toBe("PENDING");
  });
});

describe("problem+json 载荷", () => {
  it("库存不足：字段与 Java 版逐字一致", () => {
    const body = insufficientStockProblem({ sku: "SKU-003", requested: 5, available: 2 });
    expect(JSON.stringify(body)).toBe(
      '{"title":"库存不足","status":409,"detail":"库存不足 sku=SKU-003 需要=5 剩余=2","sku":"SKU-003","requested":5,"available":2}',
    );
  });

  it("其余四种状态码的形状", () => {
    expect(JSON.stringify(validationProblem({ sku: "不能为空" }))).toBe(
      '{"title":"参数错误","status":400,"detail":"请求参数校验失败","errors":{"sku":"不能为空"}}',
    );
    expect(notFoundProblem("商品 不存在: 9999")).toEqual({
      title: "资源不存在",
      status: 404,
      detail: "商品 不存在: 9999",
    });
    expect(conflictProblem("SKU 已存在: SKU-001")).toEqual({
      title: "业务冲突",
      status: 409,
      detail: "SKU 已存在: SKU-001",
    });
    expect(optimisticLockProblem()).toEqual({
      title: "并发冲突",
      status: 409,
      detail: "数据已被其他请求修改，请重试",
    });
    expect(dataIntegrityProblem()).toEqual({
      title: "数据冲突",
      status: 409,
      detail: "数据违反唯一性或外键约束",
    });
    expect(badRequestProblem("单笔订单最多 20 个商品行")).toEqual({
      title: "非法请求",
      status: 400,
      detail: "单笔订单最多 20 个商品行",
    });
  });
});

describe("时间", () => {
  it("本地 ISO 串不带时区后缀", () => {
    const date = new Date(2026, 9, 25, 9, 33, 41, 123);
    const iso = localIsoDateTime(date);
    expect(iso).toBe("2026-10-25T09:33:41.123");
    expect(iso).not.toContain("Z");
    expect(new Date(iso).getFullYear()).toBe(2026);
  });
});
