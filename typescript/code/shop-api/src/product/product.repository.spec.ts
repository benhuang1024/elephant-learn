import { describe, expect, it } from "vitest";
import { createDatabase } from "../db/database.js";
import type { DatabaseService } from "../db/database.js";
import { orderItems, orders } from "../db/schema.js";
import { ProductRepository, toProductWire } from "./product.repository.js";
import {
  ConflictException,
  DataIntegrityException,
  NotFoundException,
  OptimisticLockException,
} from "../common/domain-errors.js";
import type { DecimalAmount } from "@shop/shared";

/**
 * Repository 单元测试 —— 对照 Java 的 @DataJpaTest
 *
 * Java 侧要起 Spring 测试上下文 + 内嵌 H2 才能测 Repository；
 * 这里 Drizzle 的 Repository 就是普通类，给它一个内存库连接即可（**没有容器也能测**）。
 * 显式 SQL 映射器的测试面就是小：少一层「代理/上下文」，也少了「测试里为什么没生效」这类问题。
 */

/** 测试里用字面量造品牌值；生产代码必须走 parseDecimal()（见 docs/02 的 branded type）。 */
const d = (value: string): DecimalAmount => value as DecimalAmount;

function repositoryWith(db: ReturnType<typeof createDatabase>["db"]): ProductRepository {
  // 只依赖 .db 一个字段，所以用结构等价对象代替 DatabaseService（docs/09 讨论 mock 策略）
  return new ProductRepository({ db } as unknown as DatabaseService);
}

describe("ProductRepository", () => {
  it("seed 幂等，查询按 name 排序", () => {
    const repo = repositoryWith(createDatabase(":memory:").db);
    const rows = [
      { sku: "SKU-002", name: "人体工学椅", price: d("1299.00"), stock: 5 },
      { sku: "SKU-001", name: "机械键盘", price: d("599.00"), stock: 20 },
    ];
    repo.seed(rows);
    repo.seed(rows);
    expect(repo.count()).toBe(2);
    expect(repo.search({}).map((row) => row.sku)).toEqual(["SKU-002", "SKU-001"]);
  });

  it("q 搜索是大小写不敏感的包含匹配", () => {
    const repo = repositoryWith(createDatabase(":memory:").db);
    repo.seed([{ sku: "KB-1", name: "Mechanical Keyboard", price: d("100.00"), stock: 1 }]);
    expect(repo.search({ q: "keyboard" })).toHaveLength(1);
    expect(repo.search({ q: "  KEYBOARD  " })).toHaveLength(1);
    expect(repo.search({ q: "mouse" })).toHaveLength(0);
    expect(repo.search({})).toHaveLength(1);
  });

  it("create 返回带 id 的行，wire 金额是 number", () => {
    const repo = repositoryWith(createDatabase(":memory:").db);
    const created = repo.create({ sku: "SKU-9", name: "鼠标", price: d("399.00"), stock: 2 });
    expect(created.id).toBeGreaterThan(0);
    expect(toProductWire(created)).toEqual({
      id: created.id,
      sku: "SKU-9",
      name: "鼠标",
      price: 399,
      stock: 2,
      version: 0,
    });
  });

  it("SKU 重复 → 409 业务冲突", () => {
    const repo = repositoryWith(createDatabase(":memory:").db);
    repo.create({ sku: "SKU-9", name: "鼠标", price: d("399.00"), stock: 2 });
    expect(() => repo.create({ sku: "SKU-9", name: "另一个", price: d("1.00"), stock: 1 })).toThrow(
      ConflictException,
    );
    try {
      repo.create({ sku: "SKU-9", name: "另一个", price: d("1.00"), stock: 1 });
    } catch (error) {
      expect((error as ConflictException).message).toBe("SKU 已存在: SKU-9");
    }
  });

  it("乐观锁：版本不匹配 → 409 并发冲突", () => {
    const repo = repositoryWith(createDatabase(":memory:").db);
    const created = repo.create({ sku: "SKU-1", name: "键盘", price: d("599.00"), stock: 3 });
    const updated = repo.update({ name: "键盘 Pro", price: d("699.00"), stock: 4 }, created.id, 0);
    expect(updated.version).toBe(1);
    expect(updated.stock).toBe(4);
    // 用旧版本号再更新一次：模拟「另一个请求已经改过这一行」
    expect(() => repo.update({ name: "过期写入", price: d("1.00"), stock: 99 }, created.id, 0)).toThrow(
      OptimisticLockException,
    );
  });

  it("不存在的 id → 404", () => {
    const repo = repositoryWith(createDatabase(":memory:").db);
    expect(() => repo.findById(1234)).toThrow(NotFoundException);
    try {
      repo.findById(1234);
    } catch (error) {
      expect((error as NotFoundException).message).toBe("商品 不存在: 1234");
    }
  });

  it("被订单引用的商品不能删除 → 409 数据冲突（外键）", () => {
    const { db } = createDatabase(":memory:");
    const repo = repositoryWith(db);
    const product = repo.create({ sku: "SKU-3", name: "鼠标", price: d("399.00"), stock: 2 });

    db.insert(orders)
      .values({
        customerName: "ben",
        status: "PENDING",
        total: d("399.00"),
        createdAt: "2026-10-25T00:00:00.000",
        version: 0,
      })
      .run();
    db.insert(orderItems)
      .values({
        orderId: 1,
        productId: product.id,
        sku: product.sku,
        unitPrice: product.price,
        quantity: 1,
        subtotal: product.price,
      })
      .run();

    expect(() => repo.delete(product.id)).toThrow(DataIntegrityException);
    // 没有引用时删除成功
    const orphan = repo.create({ sku: "SKU-4", name: "鼠标垫", price: d("19.00"), stock: 1 });
    repo.delete(orphan.id);
    expect(() => repo.findById(orphan.id)).toThrow(NotFoundException);
  });

  it("报表 topProducts 走原生 SQL（无订单时为空）", () => {
    const { db } = createDatabase(":memory:");
    const repo = repositoryWith(db);
    expect(repo.rawTopProducts(5)).toEqual([]);
    repo.create({ sku: "SKU-5", name: "显示器", price: d("1999.00"), stock: 4 });
    db.insert(orders)
      .values({
        customerName: "ben",
        status: "PENDING",
        total: d("3998.00"),
        createdAt: "2026-10-25T00:00:00.000",
        version: 0,
      })
      .run();
    db.insert(orderItems)
      .values({
        orderId: 1,
        productId: 1,
        sku: "SKU-5",
        unitPrice: d("1999.00"),
        quantity: 2,
        subtotal: d("3998.00"),
      })
      .run();
    expect(repo.rawTopProducts(5)).toEqual([{ sku: "SKU-5", name: "显示器", unitsSold: 2 }]);
  });
});
