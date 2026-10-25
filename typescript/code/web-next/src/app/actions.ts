"use server";

import { revalidatePath } from "next/cache";
import { PlaceOrderRequestSchema } from "@shop/shared";
import { ApiProblem, formatAmount, placeOrder } from "../lib/api";
import type { OrderFormState } from "../lib/order-state";

/**
 * Server Action —— 这是与 Laravel/Spring 最不一样的一处：**表单直接 POST 回一个函数**
 *
 * 对照：
 *   Laravel: form → route → Controller@store → redirect/back（一次完整 HTTP 往返 + 闪存消息）
 *   Next   : form → 同一次请求里执行这个函数 → 返回新的 state（没有单独的 API endpoint，没有跳转）
 *
 * 所以这里没有 REST 语义：入参是 FormData，出参是我们自己定义的 OrderFormState。
 * 「要不要暴露 REST API」是架构决定：本仓库仍然走 REST（因为要和 Java 版横向对比 + 三端复用），
 * Server Action 只做「编排 + 错误翻译」，docs/13 会讲什么时候可以跳过 REST 直接连数据库。
 */

export async function placeOrderAction(
  _previous: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const raw = {
    customerName: String(formData.get("customerName") ?? ""),
    items: [
      {
        productId: Number(formData.get("productId")),
        quantity: Number(formData.get("quantity")),
      },
    ],
  };

  const parsed = PlaceOrderRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请求参数不合法",
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])),
      orderId: null,
    };
  }

  try {
    const order = await placeOrder(parsed.data);
    // 库存变了 → 让当前路由的渲染缓存失效，等价于「提交后重新查」
    revalidatePath("/");
    return {
      ok: true,
      message: `下单成功：订单 #${order.id}，合计 ${formatAmount(order.total)}，状态 ${order.status}`,
      fieldErrors: {},
      orderId: order.id,
    };
  } catch (error) {
    if (error instanceof ApiProblem) {
      return {
        ok: false,
        message: `${error.title}（HTTP ${error.status}）：${error.message}`,
        fieldErrors: error.fieldErrors,
        orderId: null,
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "未知错误",
      fieldErrors: {},
      orderId: null,
    };
  }
}
