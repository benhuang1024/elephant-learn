import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { OrderResponseSchema, ProductResponseSchema } from "@shop/shared";
import { useCatalogStore } from "../src/stores/catalog";

/**
 * store 单元测试 —— Vue 侧最划算的测试对象
 *
 * 不需要 jsdom、不需要 mount 组件：setActivePinia 一个新 pinia，
 * 把 api 模块 vi.mock 掉，剩下的就是纯逻辑（≈ Laravel 里测 service 而不是测 Blade）。
 */
vi.mock("../src/api", () => ({
  ApiProblem: class ApiProblem extends Error {
    constructor(
      readonly status: number,
      readonly title: string,
      message: string,
      readonly fieldErrors: Record<string, string> = {},
    ) {
      super(message);
    }
  },
  fetchProducts: vi.fn(),
  placeOrder: vi.fn(),
  formatAmount: (value: string) => `¥${value}`,
}));

const { fetchProducts, placeOrder, ApiProblem } = await import("../src/api");

/** 品牌类型（DecimalAmount）不能直接用字面量赋值，所以测试里也走 schema —— 和运行时一模一样。 */
const keyboard = ProductResponseSchema.parse({
  id: 1,
  sku: "SKU-001",
  name: "机械键盘",
  price: 599,
  stock: 20,
  version: 0,
});

describe("catalog store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("load 填充商品并在失败时记录错误", async () => {
    vi.mocked(fetchProducts).mockResolvedValue([keyboard]);
    const store = useCatalogStore();
    await store.load();
    expect(store.products).toHaveLength(1);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();

    vi.mocked(fetchProducts).mockRejectedValue(new Error("网络断了"));
    await store.load();
    expect(store.error).toBe("网络断了");
  });

  it("select 之后能算出小计（走共享包的整数分乘法）", async () => {
    vi.mocked(fetchProducts).mockResolvedValue([keyboard]);
    const store = useCatalogStore();
    await store.load();
    store.select(keyboard);
    store.quantity = 3;
    expect(store.selected?.sku).toBe("SKU-001");
    expect(store.previewTotal).toBe("1797.00");
    expect(store.canSubmit).toBe(true);
  });

  it("submit 成功会刷新列表，失败会把 problem+json 的字段错误搬进来", async () => {
    vi.mocked(fetchProducts).mockResolvedValue([keyboard]);
    const store = useCatalogStore();
    await store.load();
    store.select(keyboard);

    vi.mocked(placeOrder).mockResolvedValue(
      OrderResponseSchema.parse({
        id: 7,
        customerName: "ben",
        status: "PENDING",
        total: 599,
        createdAt: "2026-10-25T10:00:00.000",
        version: 0,
        items: [{ productId: 1, sku: "SKU-001", unitPrice: 599, quantity: 1, subtotal: 599 }],
      }),
    );
    await store.submit();
    expect(store.lastOrder?.id).toBe(7);
    expect(fetchProducts).toHaveBeenCalledTimes(2); // 成功后重新拉列表

    vi.mocked(placeOrder).mockRejectedValue(
      new ApiProblem(409, "库存不足", "库存不足 sku=SKU-001 需要=99 剩余=20", {
        "items[0].quantity": "必须小于或等于 99",
      }),
    );
    await store.submit();
    expect(store.error).toBe("库存不足（HTTP 409）");
    expect(store.fieldErrors["items[0].quantity"]).toBe("必须小于或等于 99");
    expect(store.lastOrder?.id).toBe(7); // 失败不清空上一次成功结果
  });
});
