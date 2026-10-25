import { and, desc, eq, sql } from "drizzle-orm";
import { Injectable } from "@nestjs/common";
import {
  addDecimal,
  multiplyDecimalByInt,
  nowLocalIso,
  toWireDecimal,
  ZERO_AMOUNT,
  type DecimalAmount,
  type PlaceOrderInput,
} from "@shop/shared";
import { DatabaseService } from "../db/database.js";
import { orderItems, orders, products, type OrderItemRow, type OrderRow } from "../db/schema.js";
import {
  InsufficientStockException,
  NotFoundException,
  OptimisticLockException,
} from "../common/domain-errors.js";

/**
 * OrderRepository —— 下单事务：Drizzle 版的 @Transactional
 *
 * Java 版：`@Transactional` + JPA 脏检查，Hibernate 在 commit 时才把 products 的 UPDATE 发出去，
 * 并自动在 WHERE 里加 version=?。
 * Drizzle 版：`db.transaction(cb)` 就是一个 `BEGIN IMMEDIATE ... COMMIT/ROLLBACK`，
 * 回调里同步执行，抛异常自动回滚 —— 语义清楚，但「乐观锁条件」得自己写。
 *
 * 顺序与 Java 版逐条对齐（这点很重要，横向对比才有意义）：
 *   1. 逐行按请求顺序处理；商品不存在 → 404，整个事务回滚；
 *   2. 同一商品出现两行会**扣两次**（没有合并），第二次的库存检查看到已扣减后的值；
 *   3. 快照 sku/unit_price/subtotal 到 order_items；
 *   4. subtotal = 单价 × 数量，逐行四舍五入到分，total 是各行小计之和；
 *   5. 库存扣减用 `WHERE id=? AND version=?`，changes=0 → 并发冲突 409；
 *   6. 失败时不留订单、不改库存（all-or-nothing）。
 */
@Injectable()
export class OrderRepository {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db;
  }

  list(): OrderWire[] {
    const orderRows = this.db.select().from(orders).orderBy(desc(orders.createdAt)).all();
    if (orderRows.length === 0) return [];
    // 一次取全部行，避免 Java 版用 entity graph 解决的问题在这里变成 N+1
    const items = this.db.select().from(orderItems).all();
    return orderRows.map((order) => toOrderWire(order, items.filter((item) => item.orderId === order.id)));
  }

  findById(id: number): OrderWire {
    const order = this.db.select().from(orders).where(eq(orders.id, id)).get();
    if (!order) throw new NotFoundException("订单", id);
    const items = this.db.select().from(orderItems).where(eq(orderItems.orderId, id)).all();
    return toOrderWire(order, items);
  }

  place(input: PlaceOrderInput): OrderWire {
    return this.db.transaction((tx) => {
      let total: DecimalAmount = ZERO_AMOUNT;
      const lines: {
        productId: number;
        sku: string;
        unitPrice: DecimalAmount;
        quantity: number;
        subtotal: DecimalAmount;
      }[] = [];

      for (const line of input.items) {
        const product = tx.select().from(products).where(eq(products.id, line.productId)).get();
        if (!product) throw new NotFoundException("商品", line.productId);

        const price = product.price as DecimalAmount;
        if (line.quantity > product.stock) {
          throw new InsufficientStockException(product.sku, line.quantity, product.stock);
        }

        const subtotal = multiplyDecimalByInt(price, line.quantity);
        total = addDecimal(total, subtotal);

        const deducted = tx
          .update(products)
          .set({
            stock: product.stock - line.quantity,
            version: sql`${products.version} + 1`,
          })
          .where(and(eq(products.id, product.id), eq(products.version, product.version)))
          .run();

        if (deducted.changes === 0) throw new OptimisticLockException("商品");

        lines.push({
          productId: product.id,
          sku: product.sku,
          unitPrice: price,
          quantity: line.quantity,
          subtotal,
        });
      }

      const createdAt = nowLocalIso();
      const inserted = tx
        .insert(orders)
        .values({
          customerName: input.customerName,
          status: "PENDING",
          total,
          createdAt,
          version: 0,
        })
        .run();

      const orderId = Number(inserted.lastInsertRowid);
      for (const line of lines) {
        tx.insert(orderItems)
          .values({
            orderId,
            productId: line.productId,
            sku: line.sku,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            subtotal: line.subtotal,
          })
          .run();
      }

      return {
        id: orderId,
        customerName: input.customerName,
        status: "PENDING" as const,
        total: toWireDecimal(total),
        createdAt,
        version: 0,
        items: lines.map((line) => ({
          productId: line.productId,
          sku: line.sku,
          unitPrice: toWireDecimal(line.unitPrice),
          quantity: line.quantity,
          subtotal: toWireDecimal(line.subtotal),
        })),
      };
    });
  }
}

/** wire 形状：金额是 JSON number（与 Java 版的唯一可见差异，见 docs/07）。 */
export interface OrderWire {
  id: number;
  customerName: string;
  status: "PENDING" | "PAID" | "CANCELLED";
  total: number;
  createdAt: string;
  version: number;
  items: { productId: number; sku: string; unitPrice: number; quantity: number; subtotal: number }[];
}

function toOrderWire(order: OrderRow, items: readonly OrderItemRow[]): OrderWire {
  return {
    id: order.id,
    customerName: order.customerName,
    status: order.status as OrderWire["status"],
    total: toWireDecimal(order.total as DecimalAmount),
    createdAt: order.createdAt,
    version: order.version,
    items: items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      unitPrice: toWireDecimal(item.unitPrice as DecimalAmount),
      quantity: item.quantity,
      subtotal: toWireDecimal(item.subtotal as DecimalAmount),
    })),
  };
}
