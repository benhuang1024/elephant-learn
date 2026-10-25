import { z } from "zod";
import {
  OrderResponseSchema,
  PlaceOrderRequestSchema,
  ProductResponseSchema,
  type OrderResponse,
  type PlaceOrderRequest,
  type ProductResponse,
} from "@shop/shared";

/**
 * API 层 —— 「外部世界」的边界，类型在这里被 Zod 重新建立起来
 *
 * 后端返回的 JSON 在 TS 眼里永远是 unknown。这一层做三件事：
 * 1. 发请求（fetch + Basic 认证）；
 * 2. 用 @shop/shared 的 schema **校验并转换**响应（金额字符串、字段收窄）；
 * 3. 把 problem+json 变成带字段错误的 ApiProblem，供表单展示。
 *
 * 这一步就是第 14 章「端到端类型共享」的落点：schema 只写一次，四端复用。
 */

const USERNAME = import.meta.env.VITE_SHOP_USERNAME ?? "customer";
const PASSWORD = import.meta.env.VITE_SHOP_PASSWORD ?? "customer123";
const basicAuth = (): string => `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`;

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiProblem";
  }
}

async function request<T>(path: string, init: RequestInit, parse: (data: unknown) => T): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await toProblem(response);
  }
  return parse(await response.json());
}

async function toProblem(response: Response): Promise<ApiProblem> {
  const contentType = response.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("json") ? await response.json() : null;
  const record = (body ?? {}) as Record<string, unknown>;
  return new ApiProblem(
    response.status,
    typeof record["title"] === "string" ? record["title"] : "请求失败",
    typeof record["detail"] === "string" ? record["detail"] : `${response.status} ${response.statusText}`,
    (record["errors"] ?? {}) as Record<string, string>,
  );
}

export function fetchProducts(q?: string): Promise<ProductResponse[]> {
  const query = q && q.trim().length > 0 ? `?q=${encodeURIComponent(q.trim())}` : "";
  return request(
    `/api/products${query}`,
    { method: "GET" },
    (data) => z.array(ProductResponseSchema).parse(data),
  );
}

/** 下单：入参先过一遍 schema（客户端也校验，UX 更好），服务端仍然会再校验一次。 */
export function placeOrder(input: PlaceOrderRequest): Promise<OrderResponse> {
  const payload = PlaceOrderRequestSchema.parse(input);
  return request(
    "/api/orders",
    { method: "POST", body: JSON.stringify(payload) },
    (data) => OrderResponseSchema.parse(data),
  );
}

/** 展示用：金额字符串 → 「¥1,299.00」；注意这里不重新做浮点运算。 */
export function formatAmount(amount: string): string {
  return `¥${Number(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
