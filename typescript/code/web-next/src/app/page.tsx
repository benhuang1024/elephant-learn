import { OrderForm } from "../components/OrderForm";
import { ApiProblem, fetchProducts, formatAmount } from "../lib/api";

/**
 * 首页 = Server Component（默认，不写 "use client" 就是 RSC）
 *
 * 关键点：**在服务端直接 await 数据**，浏览器收到的 HTML 已经带商品，
 * 不需要 React 版那种「加载中 → useEffect 发请求 → 再渲染」。
 *
 * 对照 Laravel：这就是 SSR 的默认形态，只是渲染单元从 Blade 模板变成了 React 组件；
 * 而且只有被标记 "use client" 的子树才会打包 JS 发给浏览器（页面体积由「客户端岛屿」大小决定）。
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let products: Awaited<ReturnType<typeof fetchProducts>> = [];
  let loadError: string | null = null;

  try {
    products = await fetchProducts();
  } catch (error) {
    loadError =
      error instanceof ApiProblem
        ? `${error.title}（HTTP ${error.status}）：${error.message}`
        : error instanceof Error
          ? `${error.message}（shop-api 是否已在 8080 端口启动？）`
          : "未知错误";
  }

  return (
    <main className="page">
      <header>
        <h1>shop · Next.js 16 App Router</h1>
        <p className="hint">
          商品列表是服务端渲染的（浏览器收到的 HTML 已含数据），下单走 Server Action 回到服务端函数。
        </p>
      </header>

      <section className="panel">
        <h2>商品（Server Component）</h2>
        {loadError ? <p className="state error">{loadError}</p> : null}
        {!loadError ? (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>名称</th>
                <th className="num">单价</th>
                <th className="num">库存</th>
                <th className="num">version</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.sku}>
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
                  <td className="num">{formatAmount(product.price)}</td>
                  <td className="num">{product.stock}</td>
                  <td className="num">{product.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <OrderForm
        products={products.map((product) => ({
          id: product.id,
          sku: product.sku,
          name: product.name,
          stock: product.stock,
        }))}
      />
    </main>
  );
}
