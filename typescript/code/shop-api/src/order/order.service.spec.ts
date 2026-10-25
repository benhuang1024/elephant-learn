import { beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { Metrics } from "../auth/users.service.js";
import { DatabaseService, createDatabase, type ShopDatabase } from "../db/database.js";
import { products } from "../db/schema.js";
import { OrderRepository } from "./order.repository.js";
import { OrderService } from "./order.service.js";
import {
  BadRequestException,
  InsufficientStockException,
  NotFoundException,
} from "../common/domain-errors.js";
import type { DecimalAmount, PlaceOrderInput } from "@shop/shared";

/**
 * OrderService 单元测试 —— 对照 Java 的 @SpringBootTest + 事务回滚
 *
 * Nest 的 TestingModule ≈ Spring 的 @SpringBootTest，但**没有注解魔法**：
 * 你要显式列出 providers，并用 overrideProvider / useValue 替换依赖（docs/09）。
 *
 * 关键行为逐条对齐 Java 版：
 * - 下单成功：库存 20→18、version 0→1、total = 各行小计之和、状态 PENDING
 * - 商品不存在 → 404，**整单回滚**（第一行的扣减也撤销）
 * - 库存不足 → 409，整单回滚，且不产生订单
 * - 同一商品两行 → 扣两次（不做合并）
 * - 超过 max-order-items → 400 非法请求
 */

const d = (value: string): DecimalAmount => value as DecimalAmount;

describe("OrderService.place", () => {
  let db: ShopDatabase;
  let service: OrderService;
  let metrics: Metrics;

  beforeEach(async () => {
    db = createDatabase(":memory:").db;
    db.insert(products)
      .values([
        { sku: "SKU-001", name: "机械键盘", price: d("599.00"), stock: 20, version: 0 },
        { sku: "SKU-002", name: "人体工学椅", price: d("1299.00"), stock: 5, version: 0 },
        { sku: "SKU-003", name: "限量版鼠标", price: d("399.00"), stock: 2, version: 0 },
      ])
      .run();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderService,
        OrderRepository,
        Metrics,
        { provide: DatabaseService, useValue: { db } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string): unknown =>
              key === "SHOP_MAX_ORDER_ITEMS" ? 20 : key === "SHOP_CURRENCY" ? "CNY" : undefined,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(OrderService);
    metrics = moduleRef.get(Metrics);
  });

  it("下单成功：扣库存 + 升版本 + 算总价", () => {
    const input: PlaceOrderInput = {
      customerName: "ben",
      items: [{ productId: 1, quantity: 2 }],
    };
    const order = service.place(input);

    expect(order).toMatchObject({
      id: 1,
      customerName: "ben",
      status: "PENDING",
      total: 1198,
      version: 0,
      items: [{ productId: 1, sku: "SKU-001", unitPrice: 599, quantity: 2, subtotal: 1198 }],
    });
    expect(order.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);

    const row = db.select().from(products).where(eq(products.id, 1)).get();
    expect(row?.stock).toBe(18);
    expect(row?.version).toBe(1);
  });

  it("多行订单：总价是各行小计之和", () => {
    const order = service.place({
      customerName: "ben",
      items: [
        { productId: 1, quantity: 3 },
        { productId: 3, quantity: 1 },
      ],
    });
    expect(order.total).toBe(599 * 3 + 399);
    expect(order.items).toHaveLength(2);
  });

  it("库存不足 → 409，整单回滚，没有订单也没有库存变化", () => {
    expect(() =>
      service.place({
        customerName: "ben",
        items: [
          { productId: 1, quantity: 1 }, // 先成功扣一行
          { productId: 3, quantity: 5 }, // 再失败
        ],
      }),
    ).toThrow(InsufficientStockException);

    const keyboard = db.select().from(products).where(eq(products.id, 1)).get();
    const mouse = db.select().from(products).where(eq(products.id, 3)).get();
    expect(keyboard?.stock).toBe(20); // 回滚
    expect(keyboard?.version).toBe(0);
    expect(mouse?.stock).toBe(2);

    const rows = db.select().from(products).all();
    expect(rows).toHaveLength(3);
  });

  it("同一商品出现两行 → 扣两次（第二次的库存检查看到已扣减的值）", () => {
    const order = service.place({
      customerName: "ben",
      items: [
        { productId: 3, quantity: 1 },
        { productId: 3, quantity: 1 },
      ],
    });
    expect(order.total).toBe(798);
    const mouse = db.select().from(products).where(eq(products.id, 3)).get();
    expect(mouse?.stock).toBe(0);
    expect(mouse?.version).toBe(2);
  });

  it("同一商品第三行时库存已不足 → 整单失败", () => {
    expect(() =>
      service.place({
        customerName: "ben",
        items: [
          { productId: 3, quantity: 1 },
          { productId: 3, quantity: 1 },
          { productId: 3, quantity: 1 },
        ],
      }),
    ).toThrow(InsufficientStockException);
    const mouse = db.select().from(products).where(eq(products.id, 3)).get();
    expect(mouse?.stock).toBe(2);
  });

  it("商品不存在 → 404 并回滚", () => {
    expect(() =>
      service.place({
        customerName: "ben",
        items: [
          { productId: 1, quantity: 1 },
          { productId: 9999, quantity: 1 },
        ],
      }),
    ).toThrow(NotFoundException);
    const keyboard = db.select().from(products).where(eq(products.id, 1)).get();
    expect(keyboard?.stock).toBe(20);
  });

  it("超过 max-order-items → 400 非法请求", async () => {
    const smallLimit = await Test.createTestingModule({
      providers: [
        OrderService,
        OrderRepository,
        Metrics,
        { provide: DatabaseService, useValue: { db } },
        { provide: ConfigService, useValue: { get: () => 1 } },
      ],
    }).compile();
    const limited = smallLimit.get(OrderService);

    expect(() =>
      limited.place({
        customerName: "ben",
        items: [
          { productId: 1, quantity: 1 },
          { productId: 2, quantity: 1 },
        ],
      }),
    ).toThrow(BadRequestException);
    try {
      limited.place({
        customerName: "ben",
        items: [
          { productId: 1, quantity: 1 },
          { productId: 2, quantity: 1 },
        ],
      });
    } catch (error) {
      expect((error as BadRequestException).message).toBe("单笔订单最多 1 个商品行");
    }
  });

  it("@Timed 装饰器在自调用下也生效（对比 Java 的 @Transactional 代理失效）", () => {
    service.place({ customerName: "ben", items: [{ productId: 1, quantity: 1 }] });
    expect(metrics.count("OrderService.place")).toBe(1);
    expect(Object.keys(metrics.snapshot())).toEqual(["OrderService.place"]);
  });

  it("订单可查列表与详情", () => {
    const created = service.place({ customerName: "ben", items: [{ productId: 2, quantity: 1 }] });
    const list = service.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.total).toBe(1299);
    expect(service.get(created.id).customerName).toBe("ben");
    expect(() => service.get(42)).toThrow(NotFoundException);
  });
});
