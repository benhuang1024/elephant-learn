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
 * 服务端数据层 —— 只在 Server Component / Server Action 里运行
 *
 * 与 React/Vue 版最大的心智差别：这里**没有浏览器**，
 * 所以「调后端」就是一段普通的 fetch，可以用 process.env、可以直接读文件、可以开事务。
 * 生产项目建议加 `server-only` 包（文件首行 `import "server-only"`），
 * 一旦被客户端组件 import，构建期就会失败 —— 本仓库为了不增加依赖，只用约定来约束。
 *
 * 对照 Laravel + Inertia：这一层等价于 Controller 里的 HTTP 客户端调用（或干脆是 Eloquent），
 * 差别是 Next 让它默认存在于「一次服务端渲染的函数调用」里，而不是一次 HTTP 请求。
 */

const API_BASE = process.env.SHOP_API_URL ?? "http://localhost:8080";
const USERNAME = process.env.SHOP_USERNAME ?? "customer";
const PASSWORD = process.env.SHOP_PASSWORD ?? "customer123";

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

function authHeader(): string {
  // Node 侧没有 btoa 的历史包袱（Node 16+ 有全局 btoa），但显式写 Buffer 更清楚
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`;
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

export async function fetchProducts(q?: string): Promise<ProductResponse[]> {
  const query = q && q.trim().length > 0 ? `?q=${encodeURIComponent(q.trim())}` : "";
  const response = await fetch(`${API_BASE}/api/products${query}`, {
    headers: { Accept: "application/json" },
    // no-store：演示项目要立刻看到库存变化；生产请按读扩散/缓存策略调整（docs/13）
    cache: "no-store",
  });
  if (!response.ok) throw await toProblem(response);
  return z.array(ProductResponseSchema).parse(await response.json());
}

export async function placeOrder(input: PlaceOrderRequest): Promise<OrderResponse> {
  const payload = PlaceOrderRequestSchema.parse(input);
  const response = await fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await toProblem(response);
  return OrderResponseSchema.parse(await response.json());
}

export function formatAmount(amount: string): string {
  return `¥${Number(amount).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
