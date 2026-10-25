/**
 * branded type：给结构化类型补上「名义」这一半
 *
 * 问题：`type ProductId = number` 和 `type UserId = number` 是同一个类型，可以互相传错。
 * PHP/Java 靠 class 或 ramsey/uuid 的强类型解决；TS 的轻量做法是加一个「假字段」：
 * 交叉一个带 unique symbol 的属性，任何人都构造不出来，只能走你的工厂函数。
 *
 * 代价：运行时不存在（还是裸 number），序列化/反序列化仍然需要 Zod 校验。
 */

declare const BRAND: unique symbol;

export type Branded<T, B extends string> = T & { readonly [BRAND]: B };

export type ProductId = Branded<number, "ProductId">;
export type OrderId = Branded<number, "OrderId">;
export type Uuid = Branded<string, "Uuid">;

/** 唯一入口：解析 + 校验，失败返回 null（或按需 throw / Result，见 error-handling.ts）。 */
export function toProductId(raw: number | string): ProductId | null {
  const value = typeof raw === "string" ? Number(raw) : raw;
  return Number.isInteger(value) && value > 0 ? (value as ProductId) : null;
}

export function toOrderId(raw: number | string): OrderId | null {
  const value = typeof raw === "string" ? Number(raw) : raw;
  return Number.isInteger(value) && value > 0 ? (value as OrderId) : null;
}

export function toUuid(raw: string): Uuid | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? (raw as Uuid)
    : null;
}

export interface OrderLine {
  productId: ProductId;
  quantity: number;
}

/** 反例演示需要：这两个函数故意长得很像，靠 brand 才能挡住传错。 */
export function stockOf(id: ProductId, catalog: ReadonlyMap<ProductId, number>): number {
  return catalog.get(id) ?? 0;
}

export function ownerOf(id: OrderId, orders: ReadonlyMap<OrderId, string>): string | undefined {
  return orders.get(id);
}

export function buildCatalog(entries: readonly [ProductId, number][]): Map<ProductId, number> {
  return new Map(entries);
}

/** 模板字符串 id 场景：前缀 + brand，等价于 PHP 里 Value Object 的 toString()。 */
export function formatId(id: ProductId | OrderId): string {
  return String(id);
}
