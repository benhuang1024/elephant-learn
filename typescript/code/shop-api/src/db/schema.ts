import { sqliteTable, integer, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Drizzle schema —— 与 java/code/shop-api 的 V1__init.sql 逐列对照
 *
 * | Java / Flyway                    | Drizzle                              | 说明 |
 * |----------------------------------|--------------------------------------|------|
 * | BIGINT GENERATED ... IDENTITY    | integer("id", { mode: "number" }) .primaryKey({autoIncrement}) | SQLite 用 rowid 自增 |
 * | NUMERIC(12,2)                    | text("price", { mode: "number" }) 存 "599.00" | JS 没有 BigDecimal，用定点字符串保持 scale |
 * | @Version                         | integer("version") + WHERE version=? | Drizzle 没有内建乐观锁，自己写条件更新 |
 *
 * 存字符串而不是 real()：`0.1 + 0.2` 的教训在数据库层同样成立，
 * NUMERIC/DECIMAL 在 Java 侧映射 BigDecimal，映射到 TS 就是「规范化后的定点字符串」。
 */

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    /** 定点小数字符串，形如 "599.00"，等价于 NUMERIC(12,2) */
    price: text("price").notNull(),
    stock: integer("stock").notNull(),
    version: integer("version")
      .notNull()
      .default(0),
  },
  (table) => [
    uniqueIndex("uq_products_sku").on(table.sku),
    index("idx_products_name").on(table.name),
  ],
);

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerName: text("customer_name").notNull(),
  /** @Enumerated(EnumType.STRING) 的等价物：存 "PENDING" */
  status: text("status").notNull(),
  total: text("total").notNull(),
  /** LocalDateTime（无时区），形如 "2026-10-25T09:33:41.123" */
  createdAt: text("created_at").notNull(),
  version: integer("version")
    .notNull()
    .default(0),
});

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    /** 下单时的快照，后续改价不影响历史订单 */
    sku: text("sku").notNull(),
    unitPrice: text("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    subtotal: text("subtotal").notNull(),
  },
  (table) => [
    index("idx_order_items_order").on(table.orderId),
    index("idx_order_items_product").on(table.productId),
  ],
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

/**
 * 报表查询（对应 Java 的 CatalogReportDao + JdbcClient 手写 SQL）：
 * Drizzle 的逃生舱是 sql 模板标签，和 PHP 里用 DB::select() 写原生 SQL 是同一个思路。
 */
export const topProductsSql = (limit: number) => sql`
  select p.sku as sku, p.name as name, coalesce(sum(oi.quantity), 0) as units_sold
  from products p
  left join order_items oi on oi.product_id = p.id
  group by p.id, p.sku, p.name
  order by units_sold desc, p.name asc
  limit ${limit}
`;

export interface TopProduct {
  sku: string;
  name: string;
  unitsSold: number;
}

/** 让 DTO 层知道 units_sold 是整数（SQLite 的 coalesce 结果仍是数字）。 */
export interface TopProductRow {
  sku: string;
  name: string;
  units_sold: number;
}
