/**
 * 工具类型：TS 的「类型级 array_map」
 *
 * PHP 里处理「同一个结构的不同子集」只能靠文档约定（@param array{...}）或者拆成一堆 DTO 类。
 * TS 内置的映射类型可以在类型上做集合运算，这是它比 PHP 强最多的地方之一。
 *
 * 记忆方式：全部是「函数」，输入一个类型返回另一个类型。
 *   Partial<T>       全可选    ≈ 更新接口的入参
 *   Required<T>      全必填
 *   Readonly<T>      全只读
 *   Pick<T, K>       选列      ≈ array_intersect_key()
 *   Omit<T, K>       删列      ≈ array_diff_key()
 *   Record<K, V>     字典      ≈ array_fill_keys() 之后的形状
 *   Exclude/Extract  从 union 里删/留  ≈ array_diff/array_intersect
 *   NonNullable<T>   去掉 null|undefined
 *   Awaited<T>       剥掉 Promise 层数
 *   Parameters/Fn、ReturnType<Fn>      反射函数签名
 */

import type { Entity } from "./generics.ts";

export interface Product {
  id: number;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
  description?: string;
  createdAt: string;
}

/** 更新入参：全部可选。 */
export type ProductPatch = Partial<Product>;

/** 表单元数据：只保留列表页要展示的列。 */
export type ProductListItem = Pick<Product, "id" | "sku" | "name" | "priceCents">;

/** 创建入参：去掉服务端生成的字段。 */
export type NewProduct = Omit<Product, "id" | "createdAt">;

/** 深度只读：注意 Readonly 只作用于第一层，嵌套对象要自己写递归映射。 */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

/** 递归把可选变必填，配合 satisfies 做「配置必须有全部键」。 */
export type Complete<T> = {
  [K in keyof Required<T>]-?: Required<T>[K];
};

/** 模板字面量类型：把路由字符串变成类型，PHP 里只能在运行时靠 string 比较。 */
export type ApiPath = `/api/products/${number}` | "/api/products";
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type Route = `${Uppercase<HttpMethod>} ${ApiPath}`;

/** 映射类型 + 条件类型：把 EventMap 变成「事件名 -> 回调签名」的强类型 emitter。 */
export interface ShopEvents {
  orderPlaced: { orderId: number };
  stockLow: { sku: string; stock: number };
}

export type Listener<E extends keyof ShopEvents> = (payload: ShopEvents[E]) => void;

export class TypedEventBus {
  private handlers: { [K in keyof ShopEvents]?: Listener<K>[] } = {};

  on<E extends keyof ShopEvents>(event: E, handler: Listener<E>): this {
    const existing = (this.handlers[event] ?? []) as Listener<E>[];
    // 泛型写入的经典问题：编译器无法证明 list 的形状就是 handlers[E]，只能局部断言
    this.handlers[event] = [...existing, handler] as never;
    return this;
  }

  emit<E extends keyof ShopEvents>(event: E, payload: ShopEvents[E]): void {
    for (const handler of this.handlers[event] ?? []) handler(payload);
  }
}

/** infer：在类型里「解出」某一部分，≈ 模式匹配。 */
export type FirstOf<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]]
  ? H
  : never;

export type Unwrap<T> = T extends Promise<infer V> ? V : T;

/** 内置工具类型也可组合：把 async 函数的返回类型拿到手。 */
export type ProductResult = Awaited<ReturnType<typeof loadProduct>>;

export async function loadProduct(id: number): Promise<Product | undefined> {
  return id > 0 ? { id, sku: "SKU-1", name: "键盘", priceCents: 1, stock: 1, createdAt: "" } : undefined;
}

/** 一个典型实用组合：实体 + 可选关联，避免 N+1 时类型写两遍。 */
export type WithRelations<T, R> = T & Partial<R>;
export type OrderWithItems = WithRelations<Entity<number>, { items: ProductListItem[] }>;
