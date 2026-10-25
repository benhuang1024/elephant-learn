import { z } from "zod";
import { PositiveAmountSchema } from "./decimal.js";

/**
 * 订单 DTO —— 与 java/code/shop-api 的 PlaceOrderRequest / OrderResponse 对齐
 *
 * 注意 Java 侧的字段校验是注解（@NotEmpty @Size(max=20) @Valid 嵌套），
 * TS 侧是 Zod 的链式组合；两者都是「声明即校验」，但 Zod 还能把结果推导成类型给前端用。
 */

export const ORDER_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;

export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderLineRequestSchema = z.object({
  /** Java: @NotNull @Positive Long —— 缺省就报「不能为 null」，这里等价于必填 */
  productId: z.int("必须是整数").positive("必须是正数"),
  /** Java: primitive int + @Min(1) @Max(99) —— 缺省会变成 0 然后被 @Min(1) 拦下 */
  quantity: z.int("必须是整数").min(1, "必须大于或等于 1").max(99, "必须小于或等于 99"),
});

export const PlaceOrderRequestSchema = z.object({
  customerName: z.string().trim().min(1, "不能为空").max(100, "个数必须在 0 和 100 之间"),
  items: z
    .array(OrderLineRequestSchema)
    .min(1, "不能为空")
    .max(20, "个数必须在 0 和 20 之间"),
});

export type PlaceOrderRequest = z.input<typeof PlaceOrderRequestSchema>;
export type PlaceOrderInput = z.infer<typeof PlaceOrderRequestSchema>;
export type OrderLineRequest = z.infer<typeof OrderLineRequestSchema>;

/** 订单行快照：sku 和单价是下单时的拷贝，后续改价不影响历史订单（与 Java 版一致）。 */
export const OrderItemResponseSchema = z.object({
  productId: z.int(),
  sku: z.string(),
  unitPrice: PositiveAmountSchema,
  quantity: z.int(),
  subtotal: PositiveAmountSchema,
});

export type OrderItemResponse = z.infer<typeof OrderItemResponseSchema>;

export const OrderResponseSchema = z.object({
  id: z.int(),
  customerName: z.string(),
  status: OrderStatusSchema,
  total: PositiveAmountSchema,
  /** 本地 ISO 时间，无时区后缀，≈ Java 的 LocalDateTime + ISO_LOCAL_DATE_TIME */
  createdAt: z.iso.datetime({ offset: true, local: true }),
  version: z.int(),
  items: z.array(OrderItemResponseSchema),
});

export type OrderResponse = z.infer<typeof OrderResponseSchema>;
