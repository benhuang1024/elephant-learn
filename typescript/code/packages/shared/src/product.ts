import { z } from "zod";
import { PositiveAmountSchema, type DecimalAmount } from "./decimal.js";

/**
 * 商品 DTO —— 与 java/code/shop-api 的 ProductResponse / ProductRequest 完全同名同形
 *
 * Java 侧用 record + Jakarta Validation：
 *   record ProductRequest(@NotBlank @Size(max=64) String sku, ..., @DecimalMin("0.01") BigDecimal price, @Min(0) int stock)
 * TS 侧用 Zod：schema 是**运行时**的，类型是从 schema **推导**的（z.infer），
 * 这正是第 05 章的主题 ——「类型会被擦除，所以边界必须校验」。
 */

/** 响应：`{"id":1,"sku":"SKU-001","name":"机械键盘","price":599.00,"stock":20,"version":0}` */
export const ProductResponseSchema = z.object({
  id: z.int(),
  sku: z.string(),
  name: z.string(),
  /** 入站是 JSON number（保留 scale 的写法由 HTTP 层负责），推导类型是 "599.00" 字符串 */
  price: PositiveAmountSchema,
  stock: z.int(),
  version: z.int(),
});

export type ProductResponse = z.infer<typeof ProductResponseSchema>;

/** 创建商品：stock 缺省时为 0，与 Java 的 primitive int 行为一致。 */
export const CreateProductRequestSchema = z.object({
  sku: z.string().trim().min(1, "不能为空").max(64, "个数必须在 0 和 64 之间"),
  name: z.string().trim().min(1, "不能为空").max(200, "个数必须在 0 和 200 之间"),
  price: PositiveAmountSchema,
  stock: z.int().min(0, "必须大于或等于 0").default(0),
});

export type CreateProductRequest = z.input<typeof CreateProductRequestSchema>;
export type CreateProductInput = z.infer<typeof CreateProductRequestSchema>;

/** 更新商品：Java 版的 UpdateProductRequest 没有 sku —— sku 不可改，这里用类型系统同样禁止。 */
export const UpdateProductRequestSchema = z.object({
  name: z.string().trim().min(1, "不能为空").max(200, "个数必须在 0 和 200 之间"),
  price: PositiveAmountSchema,
  stock: z.int().min(0, "必须大于或等于 0"),
});

export type UpdateProductRequest = z.input<typeof UpdateProductRequestSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductRequestSchema>;

/** 查询参数：只认 q；q 为空白视为「没有搜索词」（对应 Java 的 isBlank() 判断）。 */
export const ProductQuerySchema = z.object({
  q: z.string().optional(),
});

export type ProductQuery = z.infer<typeof ProductQuerySchema>;

export function hasSearchTerm(query: ProductQuery): boolean {
  return query.q !== undefined && query.q.trim().length > 0;
}

/** 领域侧写入用的形状（price 已经是规范化字符串）。 */
export interface ProductRecord {
  id: number;
  sku: string;
  name: string;
  price: DecimalAmount;
  stock: number;
  version: number;
}
