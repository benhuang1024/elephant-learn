"use client";

import { useActionState } from "react";
import { placeOrderAction } from "../app/actions";
import { initialOrderFormState } from "../lib/order-state";

/**
 * 客户端组件（Client Component）—— 只有这一小块会被打包成浏览器 JS
 *
 * 判断标准只有一个问题：**这段代码需要浏览器吗？**
 *   需要（事件、状态、useActionState、fetch on click）→ "use client"
 *   不需要（拼 HTML、查数据）→ 保持 Server Component
 *
 * 对照 Inertia：Inertia 的页面是一个完整 SPA 组件，数据靠 props 注入；
 * 这里 OrderForm 只接「商品选项」这一个 prop，提交直接回服务端函数 —— 
 * 交互边界比 Inertia 小得多，这也是 RSC 的核心卖点。
 */

interface ProductOption {
  id: number;
  sku: string;
  name: string;
  stock: number;
}

export function OrderForm({ products }: { products: ProductOption[] }) {
  const [state, formAction, isPending] = useActionState(placeOrderAction, initialOrderFormState);

  return (
    <section className="panel">
      <h2>下单（Server Action）</h2>
      <form action={formAction}>
        <label>
          商品
          <select name="productId" defaultValue={products[0]?.id}>
            {products.length === 0 ? <option value="0">（没有可选商品）</option> : null}
            {products.map((product) => (
              <option key={product.sku} value={product.id} disabled={product.stock === 0}>
                {product.name} · 库存 {product.stock}
              </option>
            ))}
          </select>
        </label>

        <label>
          数量
          <input name="quantity" type="number" min={1} max={99} defaultValue={1} />
        </label>

        <label>
          客户名
          <input name="customerName" defaultValue="ben" />
        </label>

        <button type="submit" disabled={isPending || products.length === 0}>
          {isPending ? "提交中…" : "提交订单"}
        </button>
      </form>

      {state.message ? (
        <p className={state.ok ? "state ok" : "state error"}>{state.message}</p>
      ) : null}

      {Object.keys(state.fieldErrors).length > 0 ? (
        <ul>
          {Object.entries(state.fieldErrors).map(([field, message]) => (
            <li key={field} className="state error">
              <code>{field}</code>：{message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
