import { and, asc, eq, sql } from "drizzle-orm";
import { Injectable } from "@nestjs/common";
import { DatabaseService, isForeignKeyViolation, isUniqueViolation } from "../db/database.js";
import { products, topProductsSql, type ProductRow } from "../db/schema.js";
import {
  ConflictException,
  DataIntegrityException,
  NotFoundException,
  OptimisticLockException,
} from "../common/domain-errors.js";
import type { CreateProductInput, ProductQuery, UpdateProductInput } from "@shop/shared";
import { hasSearchTerm, toWireDecimal, type DecimalAmount } from "@shop/shared";

/**
 * ProductRepository —— Drizzle 版，对应 Java 的 ProductRepository（Spring Data 派生查询）
 *
 * | Java / Spring Data              | Drizzle                                        |
 * |---------------------------------|------------------------------------------------|
 * | findAll(Sort.by("name"))        | db.select().from(products).orderBy(asc(name))  |
 * | findByNameContainingIgnoreCase  | sql`lower(name) like lower('%term%')`          |
 * | findBySku(返回 Optional)        | .get() → `row | undefined`                     |
 * | save(entity)（脏检查）          | insert / update，每次写都显式                  |
 * | @Version 乐观锁                 | where(and(eq(id), eq(version))) + changes===0  |
 *
 * 最大差异：JPA 有「持久化上下文 + 脏检查」，Service 里改字段后不用调 save；
 * Drizzle 是**显式 SQL 映射器**（心智上更接近 Laravel 的 Query Builder 或 PDO），
 * 每次写都要自己写 update/insert —— 少一层魔法，也少了「隐式 flush」这类意外。
 */
@Injectable()
export class ProductRepository {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db;
  }

  search(query: ProductQuery): ProductRow[] {
    if (!hasSearchTerm(query)) {
      return this.db.select().from(products).orderBy(asc(products.name)).all();
    }
    const pattern = `%${(query.q ?? "").trim()}%`;
    return this.db
      .select()
      .from(products)
      .where(sql`lower(${products.name}) like lower(${pattern})`)
      .orderBy(asc(products.name))
      .all();
  }

  findById(id: number): ProductRow {
    const row = this.db.select().from(products).where(eq(products.id, id)).get();
    if (!row) throw new NotFoundException("商品", id);
    return row;
  }

  findBySku(sku: string): ProductRow | undefined {
    return this.db.select().from(products).where(eq(products.sku, sku)).get();
  }

  create(input: CreateProductInput): ProductRow {
    try {
      const inserted = this.db
        .insert(products)
        .values({
          sku: input.sku,
          name: input.name,
          price: input.price,
          stock: input.stock,
          version: 0,
        })
        .run();
      return this.findById(Number(inserted.lastInsertRowid));
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = this.findBySku(input.sku);
        throw new ConflictException(`SKU 已存在: ${existing?.sku ?? input.sku}`);
      }
      if (error instanceof NotFoundException) throw error;
      throw new DataIntegrityException(error);
    }
  }

  /**
   * 乐观锁更新：Java 用 @Version 让 Hibernate 在 UPDATE 的 WHERE 里自动追加 version=?，
   * 不匹配就抛 ObjectOptimisticLockingFailureException。Drizzle 没有版本列的魔法，
   * 这里手写同样语义 —— 看懂这段就看懂了乐观锁「到底做了什么」。
   */
  update(input: UpdateProductInput, id: number, expectedVersion: number): ProductRow {
    try {
      const result = this.db
        .update(products)
        .set({
          name: input.name,
          price: input.price,
          stock: input.stock,
          version: sql`${products.version} + 1`,
        })
        .where(and(eq(products.id, id), eq(products.version, expectedVersion)))
        .run();
      if (result.changes === 0) throw new OptimisticLockException("商品");
      return this.findById(id);
    } catch (error) {
      if (error instanceof OptimisticLockException || error instanceof NotFoundException) throw error;
      if (isUniqueViolation(error)) throw new ConflictException(`SKU 已存在: ${input.name}`);
      throw new DataIntegrityException(error);
    }
  }

  delete(id: number): void {
    this.findById(id);
    try {
      this.db.delete(products).where(eq(products.id, id)).run();
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new DataIntegrityException(error);
      throw error;
    }
  }

  count(): number {
    return this.db.select({ value: sql<number>`count(*)` }).from(products).get()?.value ?? 0;
  }

  /**
   * 手写 SQL 的逃生舱：对应 Java 的 CatalogReportDao（JdbcClient + 原生 SQL）。
   * `db.getMany(sql模板)` 让 Drizzle 直接执行裸 SQL 并映射列名，
   * units_sold 是 snake_case，Java 侧靠 rowMapper 手动映射，这里用 as 收窄一次。
   */
  rawTopProducts(limit: number): { sku: string; name: string; unitsSold: number }[] {
    const rows = this.db.all<{ sku: string; name: string; units_sold: number }>(
      topProductsSql(limit),
    );
    return rows.map((row) => ({ sku: row.sku, name: row.name, unitsSold: Number(row.units_sold) }));
  }

  /** 演示数据：按 SKU 幂等插入（对应 Java 的 DemoDataSeeder + count() > 0 判空）。 */
  seed(rows: readonly { sku: string; name: string; price: DecimalAmount; stock: number }[]): void {
    for (const row of rows) {
      if (!this.findBySku(row.sku)) {
        this.db.insert(products).values({ ...row, version: 0 }).run();
      }
    }
  }
}

/**
 * Drizzle 行 → wire DTO。
 * 金额从数据库里的定点字符串 "599.00" 变成 JSON number 599：
 * 这是与 Java 版的**唯一可见差异**（BigDecimal 有 scale，JS number 没有），详见 docs/07。
 */
export function toProductWire(row: ProductRow): {
  id: number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  version: number;
} {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    price: toWireDecimal(row.price as DecimalAmount),
    stock: row.stock,
    version: row.version,
  };
}
