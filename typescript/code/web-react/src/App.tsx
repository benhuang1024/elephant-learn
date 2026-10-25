import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiProblem, fetchProducts, formatAmount, placeOrder } from "./api";
import type { ProductResponse } from "@shop/shared";

/**
 * 商品列表 + 搜索 + 下单，全部用 TanStack Query 管理服务端状态
 *
 * 给后端人的心智映射：
 * - useQuery ≈ 一次「带缓存的 GET」，data / isLoading / error 三态是强制的（不再写 if (!$x)）
 * - useMutation ≈ 一次「POST + 失效缓存」，onSuccess 里 invalidateQueries ≈ 重跑查询
 * - 组件不碰数据库、不碰 HTTP 细节，只声明「我要什么数据」
 */
export function App() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductResponse | null>(null);
  const [quantity, setQuantity] = useState(1);
  const queryClient = useQueryClient();

  const products = useQuery({
    queryKey: ["products", search.trim()],
    queryFn: () => fetchProducts(search.trim() || undefined),
  });

  const order = useMutation({
    mutationFn: () =>
      placeOrder({
        customerName: "ben",
        items: [{ productId: Number(selected?.id), quantity }],
      }),
    onSuccess: async () => {
      // 下单改了库存 → 让商品列表缓存失效，等价于「提交后重查」
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const problem = order.error instanceof ApiProblem ? order.error : null;

  return (
    <main className="page">
      <header>
        <h1>shop · React 19 + TypeScript</h1>
        <p className="hint">
          数据来自 NestJS shop-api；类型与校验规则全部 import 自 <code>@shop/shared</code>。
        </p>
      </header>

      <section className="panel">
        <label className="search">
          搜索商品
          <input
            value={search}
            placeholder="例如：键盘"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        {products.isPending ? <p className="state">加载中…</p> : null}
        {products.isError ? (
          <p className="state error">
            加载失败：{products.error instanceof Error ? products.error.message : "未知错误"}
          </p>
        ) : null}

        {products.data ? (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>名称</th>
                <th className="num">单价</th>
                <th className="num">库存</th>
                <th className="num">version</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.data.map((product) => (
                <tr key={product.sku} className={selected?.sku === product.sku ? "picked" : ""}>
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
                  <td className="num">{formatAmount(product.price)}</td>
                  <td className="num">{product.stock}</td>
                  <td className="num">{product.version}</td>
                  <td>
                    <button
                      type="button"
                      disabled={product.stock === 0}
                      onClick={() => setSelected(product)}
                    >
                      选择
                    </button>
                  </td>
                </tr>
              ))}
              {products.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="state">
                    没有匹配的商品
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="panel">
        <h2>下单</h2>
        <p>
          当前选择：
          <strong>{selected ? `${selected.name}（${selected.sku}）` : "未选择"}</strong>
        </p>
        <label className="qty">
          数量
          <input
            type="number"
            min={1}
            max={99}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={!selected || order.isPending}
          onClick={() => order.mutate()}
        >
          {order.isPending ? "提交中…" : "提交订单"}
        </button>

        {order.isSuccess ? (
          <p className="state ok">
            下单成功：订单 #{order.data.id}，合计 {formatAmount(order.data.total)}，状态 {order.data.status}
          </p>
        ) : null}

        {problem ? (
          <div className="state error">
            <strong>
              {problem.title}（HTTP {problem.status}）
            </strong>
            <p>{problem.message}</p>
            {Object.entries(problem.fieldErrors).length > 0 ? (
              <ul>
                {Object.entries(problem.fieldErrors).map(([field, message]) => (
                  <li key={field}>
                    <code>{field}</code>：{message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
