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
 * API 层与 React 版**同构**（同样的 schema、同样的 problem 处理）——
 * 这正是 monorepo 共享包的卖点：换框架不换契约。docs/14 讨论要不要抽成第三个包。
 */

const USERNAME = import.meta.env.VITE_SHOP_USERNAME ?? "customer";
const PASSWORD = import.meta.env.VITE_SHOP_PASSWORD ?? "customer123";

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

function basicAuth(): string {
  return `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`;
}

async function toProblem(response: Response): Promise<ApiProblem> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json") ? ((await response.json()) as Record<string, unknown>) : {};
  return new ApiProblem(
    response.status,
    typeof body["title"] === "string" ? body["title"] : "请求失败",
    typeof body["detail"] === "string" ? body["detail"] : `${response.status} ${response.statusText}`,
    (body["errors"] ?? {}) as Record<string, string>,
  );
}

async function post<T>(path: string, payload: unknown, parse: (data: unknown) => T): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: basicAuth(),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await toProblem(response);
  return parse(await response.json());
}

export async function fetchProducts(q?: string): Promise<ProductResponse[]> {
  const query = q && q.trim().length > 0 ? `?q=${encodeURIComponent(q.trim())}` : "";
  const response = await fetch(`/api/products${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw await toProblem(response);
  return z.array(ProductResponseSchema).parse(await response.json());
}

export async function placeOrder(input: PlaceOrderRequest): Promise<OrderResponse> {
  const payload = PlaceOrderRequestSchema.parse(input);
  return post("/api/orders", payload, (data) => OrderResponseSchema.parse(data));
}

export function formatAmount(amount: string): string {
  return `¥${Number(amount).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
