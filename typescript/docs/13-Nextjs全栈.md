# 13 Next.js 全栈

> **配套代码（web-next）**
> 依赖与脚本：[package.json](../code/web-next/package.json)　配置：[next.config.ts](../code/web-next/next.config.ts)、[tsconfig.json](../code/web-next/tsconfig.json)、[next-env.d.ts](../code/web-next/next-env.d.ts)
> 路由与布局：[src/app/layout.tsx](../code/web-next/src/app/layout.tsx)、[src/app/page.tsx](../code/web-next/src/app/page.tsx)、[src/app/globals.css](../code/web-next/src/app/globals.css)
> Server Action：[src/app/actions.ts](../code/web-next/src/app/actions.ts)　状态契约：[src/lib/order-state.ts](../code/web-next/src/lib/order-state.ts)
> 客户端组件：[src/components/OrderForm.tsx](../code/web-next/src/components/OrderForm.tsx)　服务端数据层：[src/lib/api.ts](../code/web-next/src/lib/api.ts)
> 单测：[test/api.test.ts](../code/web-next/test/api.test.ts)　契约：[packages/shared/src/product.ts](../code/packages/shared/src/product.ts)
> 端口：`next dev -p 3100`；Next 在服务端调 API，**不需要 Vite 那种 /api 代理**（第 12 章的 web-vue 3010、第 10 章讲过的 web-react 3000 才需要）

## 1. 概念映射：这一章没有「后端」这个词

你在 Laravel 里的世界是这样的：Nginx → PHP-FPM → `public/index.php` → Kernel → Router → Controller → Blade → HTML。Next.js 16（App Router）把这条链压缩成：**一个 Node 进程既是 Web 服务器、又是路由、又是视图层、还是「后端逻辑」的宿主**。

| Laravel | Next.js 16 App Router |
|---|---|
| `routes/web.php` | 没有路由文件，**目录结构就是路由**（`src/app/**`） |
| `resources/views/layouts/app.blade.php` | `src/app/layout.tsx`（`RootLayout`）+ `{children}`（对应 `@yield`） |
| `Route::get('/products/{id}')` + `ProductController` | `src/app/products/[id]/page.tsx` |
| Controller 方法里查数据、`return view(...)` | `async function Page()` 里 `await` 数据、`return JSX`（Server Component） |
| Blade 模板 / Alpine 交互 | RSC（服务端渲染，不发 JS）/ `"use client"` 组件（会被打包进浏览器） |
| `FormRequest` + `Controller@store` + `redirect()->back()->with('status', ...)` | `"use server"` 的函数 + `useActionState`（无跳转、无闪存） |
| `artisan make:controller` | `mkdir src/app/foo && touch page.tsx` |
| `php artisan route:list` | `next build` 输出的 Route 表格 |
| `.env` + `config('shop.api_url')` | 服务端 `process.env`；浏览器只能用 `NEXT_PUBLIC_*` |
| `nginx` + `php-fpm` 常驻 | `next start`（Node 常驻）或 standalone server.js / 平台 adapter |

**版本号（本机实测）**：`next` 16.4.3、`react`/`react-dom` 19.3.1、`@types/react` 19.3.0、`typescript` 7.0.2、`vitest` 5.0.5、`zod` 4.6.7。Next 16 **默认用 Turbopack** 做 dev 与 build 的打包器（配置里没有也无法「切回 webpack」的开关，`next.config.ts` 保持极简）。

## 2. 路由约定：文件即路由

本仓库只有一个页面，所以 `src/app` 下很干净：

```
src/app/layout.tsx      ← 根布局，必须存在，渲染 <html><body>
src/app/page.tsx        ← 路由 "/"
src/app/globals.css     ← 在 layout.tsx 里 import，全局生效
src/app/actions.ts      ← 不是路由！普通模块（"use server"）
```

只有 Next 认识的**保留文件名**才成为路由：

| 文件名 | 语义 | Laravel 类比 |
|---|---|---|
| `page.tsx` | 该目录是一个可访问端点，默认 RSC | Controller + view |
| `layout.tsx` | 嵌套壳，`{children}` 注入下层；**不会在子路由切换时重新挂载**（`template.tsx` 相反：重新挂载 + 进入动画） | `@yield` / `@extends` |
| `loading.tsx` | 包一层 `<Suspense>`，流式骨架 | Blade 的骨架屏 |
| `error.tsx` | 客户端组件，捕获下层渲染错误 | Laravel 的 `errors/500.blade.php`（但这是组件级） |
| `not-found.tsx` | 404 内容；`app/not-found.tsx` 为全局 | `abort(404)` 的视图 |
| `route.ts` | **Route Handler**：真正的 HTTP 端点（GET/POST…） | `routes/api.php` + Controller |
| `[slug]/page.tsx` | 动态段 | `/products/{id}` |
| `[...rest]/page.tsx` | catch-all（`rest` 是 string[]）；`[[...opt]]/` 为 optional catch-all | 通配路由 |
| `(admin)/page.tsx` | route group：**括号不出现在 URL**，只用于分组/共用 layout | 目录命名空间 |
| `_xyz/` | 私有目录，不参与路由约定 | — |

本仓库项目里没有动态段（没有 `[id]` 目录），所以生成的类型是这样一份「只有一个路由」的清单——`next build` 把它写到 `.next/types/routes.d.ts`（构建产物，不进版本库），再由仓库里那份 [next-env.d.ts](../code/web-next/next-env.d.ts) 转发给 `tsconfig`：

```ts
type AppRoutes = "/";  type LayoutRoutes = "/";
interface ParamMap { "/": {} }
export type ParamsOf<Route extends Routes> = ParamMap[Route]
```

这就是 Next 的「**类型化链接**」：`<Link href="/products/1">` 写错路径时，配合 `typedRoutes: true` 会在 `tsc`/`next build` 阶段报错，而不是运行时 404。Laravel 有 `route('products.show', $id)` 的名字解析做同样的事；Next 的做法是「路径本身是生成出来的联合类型」，不需要维护命名表。动态段的 `params` 也是类型化的（`root-params.d.ts` 本项目为空：`No root params detected.`）。

## 3. RSC 与客户端组件：边界怎么划

### 3.1 一句话判据

> **这段代码需要浏览器吗？** 需要（事件、`useState`、`useActionState`、点击时才发请求）→ `"use client"`；不需要（拼 HTML、查数据、算金额）→ 保持 Server Component。

本仓库的划分就是教科书式的三块：

| 文件 | 指令 | 角色 | 是否进浏览器 bundle |
|---|---|---|---|
| [src/app/page.tsx](../code/web-next/src/app/page.tsx)、[layout.tsx](../code/web-next/src/app/layout.tsx) | 无（默认） | RSC：`await fetchProducts()` + 渲染表格；layout 出 `<html>` + `metadata` | ❌ 只出 HTML |
| [src/components/OrderForm.tsx](../code/web-next/src/components/OrderForm.tsx) | `"use client"` | 表单交互 + `useActionState` | ✅ |
| [src/app/actions.ts](../code/web-next/src/app/actions.ts) | `"use server"` | Server Action：编排 + 错误翻译 | ❌（客户端只有代理） |
| [src/lib/order-state.ts](../code/web-next/src/lib/order-state.ts) | 无 | 类型 + 初始常量，两端共用 | 值进客户端 |
| [src/lib/api.ts](../code/web-next/src/lib/api.ts) | 无（约定只用服务端） | fetch + Zod 校验 + `process.env` | ❌ |

### 3.2 指令的真实语义（这是最容易被讲错的地方）

`"use client"` **不是**「这个文件跑在客户端」。它的语义是**打包边界（module boundary）**：

1. 从某个 RSC 里 `<import>` 一个标了 `"use client"` 的模块，就切出一条边界；
2. 该模块 **及其全部下游依赖（transitive imports）** 被编译进客户端图（client graph），成为浏览器可 hydration 的模块图；
3. 边界以上的模块留在服务端图；
4. 跨越边界的唯一通道是 **props（必须可序列化）** 和 children slot。

所以「`"use client"` 写在根组件上 = 整个应用都变成客户端 bundle」不是修辞，是字面事实。这就是为什么要**把边界尽量往下推**、把纯展示的表格留在 RSC。

对照 `page.tsx` 里那段真实的跨边界传值：

```tsx
<OrderForm
  products={products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    stock: product.stock,
  }))}
/>
```

注意它**没有把整个 `ProductResponse` 传下去**：客户端组件只需要 4 个字段，就把 `price`/`version` 留在服务端。除了减少序列化体积，还有一个安全收益——跨边界的 props 会进入 HTML 里的 RSC payload（浏览器可见），少传一个字段就少泄漏一个字段。同理 `OrderForm.tsx` 里自己声明了一个窄的 `interface ProductOption`，而不是复用 `@shop/shared` 的 `ProductResponse`：**props 类型是组件的真实契约**，服务端契约比它宽是正常的。

### 3.3 构建产物验证（不是背文档，是打开 `.next` 看）

我在本机 grep 了构建产物，坐实了上面的说法：

```
$ grep -rl 'fetchProducts' web-next/.next/static/chunks/*.js              → 无匹配
$ grep -rl 'SHOP_PASSWORD\|Buffer.from' web-next/.next/static/chunks/*.js → 无匹配
```

`src/lib/api.ts` 里带凭据的代码**没有**出现在任何客户端 chunk 中；而 `OrderForm` 出现在 `.next/static/chunks/`（客户端）与 `.next/server/chunks/ssr/`（服务端 SSR 也需要渲染它一次）。这正是 RSC 的双面性：**客户端组件同时被服务端渲染和客户端 hydration**，只是它不能 import 服务端机密。

### 3.4 `"use server"` 的边界与那条硬规矩

`"use server"` 标记的是**导出函数的集合**：这些函数被编译成「server reference」，客户端拿到的是一个带 id 的代理，调用即 `POST` 回服务端执行。规矩里最常撞墙的一条：

> **`"use server"` 模块只能导出 async 函数。**

本仓库早期正是把类型和初始值写在 `actions.ts` 里的（`export interface OrderFormState` + `export const initialOrderFormState`），构建**照样通过**、页面照样渲染——但 `.next/server/server-reference-manifest.json` 里留下了证据：

```json
"7fbf54b7…": { "filename": "web-next/src/app/actions.ts", "exportedName": "initialOrderFormState", "async": false }
```

非 async 的导出也被登记成了 server reference，客户端 chunk 里对应的是一段 `createServerReference("7fbf54b7…", callServer, void 0, findSourceMapURL, "initialOrderFormState")`——也就是说 `OrderForm` 拿到的 `initialOrderFormState` **是一个函数代理，不是那个字面量对象**。表现非常阴险：读 `state.message` 得到 `undefined`（不报错，只是永远不显示），而 `Object.keys(state.fieldErrors)` 会抛 `Cannot convert undefined or null to object`。

现在的代码把它拆开了，这就是 [src/lib/order-state.ts](../code/web-next/src/lib/order-state.ts) 存在的唯一理由：

```ts
// 没有 "use server" 指令的普通模块，两端都能安全 import
export interface OrderFormState { ok: boolean; message: string; fieldErrors: Record<string, string>; orderId: number | null }
export const initialOrderFormState: OrderFormState = { ok: false, message: "", fieldErrors: {}, orderId: null };
```

而 [actions.ts](../code/web-next/src/app/actions.ts) 只留函数，类型走 `import type`（编译期擦除，不会跨边界）：

```ts
"use server";
import type { OrderFormState } from "../lib/order-state";
export async function placeOrderAction(_previous: OrderFormState, formData: FormData): Promise<OrderFormState> { ... }
```

**给 PHP 老兵的规则表**：

| 想共享的东西 | 放哪 | 为什么 |
|---|---|---|
| 纯类型（interface/type） | 任意模块，配合 `import type` | 编译后不存在 |
| 常量/初始状态/枚举 | 无指令的模块（`src/lib/order-state.ts`） | 有指令的模块会把它变 server reference |
| 服务端函数 | `"use server"` 模块，且只导出 async 函数 | 边界要求可序列化签名 |
| 服务端机密（DB / 密钥 / Basic auth） | 只被 RSC / Server Action / Route Handler 引用的模块 | 客户端组件 import 它 = 泄漏或构建失败 |

`src/lib/api.ts` 的注释里写明了生产做法：装 `server-only` 包并在文件首行 `import "server-only"`，一旦被客户端组件 import，**构建期直接失败**。本仓库为了不增加依赖只用约定约束——这是明确的已知缺口，请在你自己的项目里补上。

## 4. Server Action：表单 POST 回一个函数

这是与 Laravel/Spring 差别最大的一处。

```php
// Laravel：一次完整 HTTP 往返 + 闪存消息 + 重定向
Route::post('/orders', [OrderController::class, 'store']);

public function store(PlaceOrderRequest $request) {           // FormRequest 负责校验
    $order = $this->orders->place($request->validated());
    return redirect()->route('orders.show', $order)
                    ->with('status', "下单成功 #{$order->id}");   // flash → session
}
```

```ts
// Next：没有 endpoint、没有 redirect、没有 session flash
"use server";
export async function placeOrderAction(_previous: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const raw = { customerName: String(formData.get("customerName") ?? ""),
    items: [{ productId: Number(formData.get("productId")), quantity: Number(formData.get("quantity")) }] };
  const parsed = PlaceOrderRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "请求参数不合法", orderId: null,
      fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) };
  }
  try {
    const order = await placeOrder(parsed.data);
    revalidatePath("/");
    return { ok: true, message: `下单成功：订单 #${order.id}，合计 ${order.total}，状态 ${order.status}`, fieldErrors: {}, orderId: order.id };
  } catch (error) { /* ApiProblem → { ok:false, message, fieldErrors } */ }
}
```

客户端这一侧只剩两行核心（[OrderForm.tsx](../code/web-next/src/components/OrderForm.tsx)）：

```tsx
const [state, formAction, isPending] = useActionState(placeOrderAction, initialOrderFormState);
// ...
<form action={formAction}>
  <button type="submit" disabled={isPending || products.length === 0}>{isPending ? "提交中…" : "提交订单"}</button>
</form>
```

对照表：

| 关注点 | Laravel + Blade | Next Server Action |
|---|---|---|
| 路由声明 | `routes/web.php` | 无（函数即端点，id 是构建期生成的 hash） |
| 入参 | `$request`（自动转数组/模型绑定） | `FormData`（**手工取字段**）+ `useActionState` 的 prevState |
| 校验 | `FormRequest::rules()` | Zod `safeParse`（与后端同一份 schema，第 14 章） |
| 成功后 | `redirect()` + 302 + flash | 返回新的 state；要「重查」就调 `revalidatePath` |
| 失败后 | `withErrors()` 回填旧输入 | `fieldErrors` 对象，自己渲染 |
| 渐进增强（禁 JS） | 天然可用（原生 form POST） | **天然可用**：`action={formAction}` 就是普通 POST |
| 幂等/CSRF | `VerifyCsrfToken` 中间件 | Next 用 origin + action id 校验，仍需自己做权限检查；体积上限 `serverActions.bodySizeLimit`（默认 1MB，[next.config.ts](../code/web-next/next.config.ts) 未改） |

坑（每条都会真实发生）：

1. **`FormData` 的值全是 `string | File`**。`Number(formData.get("quantity"))` 遇到空串是 `0`，遇到 `"abc"` 是 `NaN` —— [test/api.test.ts](../code/web-next/test/api.test.ts) 专门锁了这个行为：`productId: Number("abc")` 会被 `PlaceOrderRequestSchema` 拦下（`z.int()` 拒绝 NaN）。这就是「服务端必须重新校验」的现代版本，`@Valid`/FormRequest 换成 Zod。
2. **入参签名必须匹配 `useActionState`**：`(prevState, formData)`。多写一个自定义参数（`bind`/闭包传参）在 Server Action 里是另一套语义（闭包会捕获渲染时的值，可能陈旧）。这里刻意用 `_previous` 占位并把共享状态留在服务端。
3. **别把 Server Action 当 API 用**：它返回的是「给这个组件用的 state」，不是 REST 资源；没有状态码语义、不会被第三方复用。要对外就是 `route.ts`（Route Handler）。
4. **`revalidatePath` 只在成功路径上调**（见代码），失败时不刷新——否则一次校验失败就把列表重查一遍，浪费且会闪。
5. Server Action 默认在**同一次请求**里完成写 + 重渲染，所以浏览器看不到 302；如果你依赖「POST-redirect-GET 防重复提交」的肌肉记忆，`isPending` 是你唯一能拿到的等价物，重复提交的真正防护要在服务端（幂等键 / 唯一约束 / 乐观锁，第 07 章）。

## 5. 缓存语义：四种缓存别混为一谈

本仓库用「演示项目要立刻看到库存变化」的策略，把渲染缓存彻底关掉，同时保留一次显式失效：

```tsx
// page.tsx —— 最粗暴的一档：本可静态生成也强制每次请求渲染
export const dynamic = "force-dynamic";

// lib/api.ts —— 明确「不要缓存这段数据」；副作用是让整条路由变动态
const response = await fetch(`${API_BASE}/api/products${query}`, {
  headers: { Accept: "application/json" },
  cache: "no-store", // 生产请按读扩散/缓存策略调整
});

// actions.ts —— 库存变了 → 让当前路由的渲染缓存失效
revalidatePath("/");
```

四个层次必须分清（这是 PHP 老兵最容易翻车的地方，因为 Laravel 里「缓存」只有一两个概念）：

| 层次 | 开关 | 谁读它 | 对照 PHP/Laravel |
|---|---|---|---|
| **fetch 数据缓存** | `cache: "force-static" \| "no-store"`；`next: { revalidate: 60, tags: [...] }` | Next  patched 的 `fetch` | 无对应（最像 `Cache::remember()` 包住一个 HTTP 调用） |
| **路由段渲染缓存（PPR/静态）** | `export const dynamic = "auto"\|"force-dynamic"\|"error"\|...`、`export const revalidate = 60` | 构建/渲染阶段 | `Route::cacheFor()` / 全站 `php artisan route:cache`，但 Next 按路由 |
| **按需失效** | `revalidatePath("/path")`、`revalidateTag("products")`、`updateTag` | 服务端缓存层 | `Cache::forget("catalog:list")` / `Cache::invalidateTags()`（需支持 tag 的 driver） |
| **HTTP 缓存** | `Cache-Control` 响应头（`export const fetchCache`、Route Handler 手写头） | 浏览器 / CDN | Nginx `expires`、Laravel 的 `->setCache(...)` |

**语义映射（背这张表比背 API 有用）**：

- `revalidatePath("/")` ≈ 删掉「某路由渲染结果」这一条缓存键 → 下一个请求重新渲染。等于 `Cache::forget()`，**不保证**同时清掉 `fetch` 层缓存。
- `revalidateTag("products")` ≈ Redis 的 tag 失效：一次清掉所有打了这个 tag 的数据。列表/详情共享同一份底层数据时应该用 tag，而不是在十几个页面里 `revalidatePath`。
- `cache: "no-store"` ≈ 明确「不要缓存这段数据」；副作用是**这条 fetch 让整个路由变成动态**（因此构建输出里 `/` 是 `ƒ` 而不是 `○`）。反过来 `"force-static"` 会连 `process.env`、cookies 一起在构建期求值，本仓库这种要读 `process.env.SHOP_API_URL` 的代码绝不能上它。
- `export const dynamic = "force-dynamic"` 是最粗暴的一档：即使本可以静态生成，也强制每次请求渲染。生产上更常见的是 `export const revalidate = 60`（ISR）。Next 16 还有 `"use cache"` + `cacheLife(...)` / `cacheTag(...)`（构建时在 `.next/types/cache-life.d.ts` 生成 profile 类型，`default` = stale 300s / revalidate 900s），本仓库没用。
- OPcache 类比：OPcache 缓存的是**编译后的字节码**，和这里四种都不是一回事。真要类比：`next build` ≈ 编译 + `config:cache` + `route:cache` 的合体，`revalidatePath` ≈ 运行时 `Cache::forget`。

## 6. metadata / SEO：没有 Blade 的 `<head>` 可用

`layout.tsx` 里唯一的「头信息」写法：

```tsx
export const metadata: Metadata = {
  title: "shop · Next.js App Router",
  description: "SSR 商品列表 + Server Action 下单",
};
```

为什么不能直接写 `<title>`：**metadata 是渲染期决定的**，Next 要参与去重、排序、拼接（`title.template`）、生成 `<link rel="alternate">`、OpenGraph、`robots` 等；写死的 `<head>` 标签会被 React 的水合/静态化流程绕过或产生重复。它对应的是 Laravel 里 `Blade::component('app.layouts.parts.head')` + 手写 meta 的那一坨。

| 需求 | Next 写法 |
|---|---|
| 每页不同标题 | 在 `page.tsx` 里 `export const metadata`；详情页用 `generateMetadata({ params, searchParams })`（**await 数据库**再返回 Metadata） |
| OG 图 / sitemap / robots | 文件约定：`app/opengraph-image.tsx`、`app/sitemap.ts`、`app/robots.ts` |
| `<html lang>` / URL 基准 | 就在 `RootLayout` 里（本项目 `lang="zh-CN"`）；绝对 URL 靠 `metadataBase`（缺失时 OG 相对路径会退化） |

SEO 结论对 PHP 老兵很重要：本项目的 `/` 是动态 SSR，浏览器收到的 HTML **已经含商品表格**（`page.tsx` 在服务端 await 完数据），爬虫直接可读——这就是相对第 12 章 Vue SPA（HTML 里只有 `<div id="app">`）的本质优势，也是 Laravel + Blade 一直天然具备的性质。Next 只是把这项能力换到了 React 组件模型里。

## 7. 完整链路：SSR 列表 + Server Action 下单

一次 `GET /` 之后 `POST` 提交订单，全过程：

```
① 浏览器 GET /
② Next 服务端匹配 app/page.tsx → dynamic=force-dynamic → 走渲染函数
③ HomePage(): await fetchProducts()               ← src/lib/api.ts
     fetch(API_BASE + "/api/products", { cache: "no-store" })   // Basic auth? GET 是公开接口，不带凭据
     z.array(ProductResponseSchema).parse(json)   // price: 599 → "599.00"（品牌字符串）
④ 返回 HTML（含表格）+ RSC payload（OrderForm 的 props：id/sku/name/stock）
⑤ 浏览器 hydration：只有 OrderForm 这一小块需要 JS
⑥ 用户点「提交订单」→ <form action={formAction}> POST（无 JS 也能提交）
⑦ Next 服务端解析 server reference → placeOrderAction(prevState, formData)   ← src/app/actions.ts
     取字段 → PlaceOrderRequestSchema.safeParse → 失败即返回 fieldErrors
     成功 → placeOrder(parsed.data)  ← lib/api.ts 带 Basic auth 的 POST /api/orders
           shop-api：ZodValidationPipe → ProductService → OrderRepository 事务（第 07 章）
     revalidatePath("/")
⑧ Next 用返回值渲染新的 OrderFormState（成功消息 + orderId），并重跑 ②~④ 生成新 HTML 返回浏览器
```

几个值得停留的点：

- **③ 的失败路径**是 `page.tsx` 里的 try/catch，而不是抛给 error boundary：API 挂了是「内容问题」不是「渲染 bug」，所以显示 `shop-api 是否已在 8080 端口启动？` 这种可操作提示，页面框架仍在。
- **⑦ 之后浏览器拿到的还是 HTML**：Server Action 的成功响应是「重渲染后的 RSC payload」，不是 JSON。因此你在 Laravel 里习惯的「前端 fetch JSON 再 setState」在这里没有位置——这是全栈 Next 与 REST + SPA 的分岔。
- **金额从不在前端做算术**：`order.total` 到 UI 时已是 `"599.00"` 字符串，成功消息直接拼 `${order.total}`（契约细节见第 14 章）。
- **两处校验不是重复劳动**：`lib/api.ts` 对**响应**用 `ProductResponseSchema.parse`（不合法即抛，宁可页面报错也不把脏数据画出来）；`actions.ts` 对**请求**用 `safeParse`（不合法即返回 fieldErrors，不抛）——一个 `parse` 一个 `safeParse`，区别就是「崩溃还是用户错误」。

## 8. 什么时候直连数据库，什么时候保留 REST

这是本章最重要的架构判断。Next 全栈给了你「跳过 API」的选项：`page.tsx` / Server Action 里可以直接 `import { db } from "@/db"` 用 Drizzle 甚至 ORM 查库——于是这个仓库的 `OrderRepository` 那套事务、乐观锁完全可以搬进 Server Action，砍掉 shop-api。

本仓库**不这么做**，理由三条，且都可复用到你自己的决策里：

| 保留 REST 的理由 | 说明 |
|---|---|
| 与 Java/Spring 版横向对比 | 同一套 `/api/products`、`/api/orders`、`problem+json`，两端才比得起来（全书的骨架） |
| 三端复用同一契约 | web-react、web-vue、web-next 共享 `@shop/shared`；直连 DB 就把契约散进三个前端 |
| 边界清晰、独立扩缩与复用 | 移动端/合作方/未来第二个服务都需要稳定 API；DB 连接池、鉴权、限流集中在服务端 |

反过来说，**该直连数据库**的场景同样明确，值得记成 checklist：

| 场景 | 建议 |
|---|---|
| 内部运营后台（Next 独占数据，永不复用） | 直连 DB：少一跳网络、少一套鉴权、事务就在 action 里 |
| 页面首屏强依赖复杂查询/聚合报表 | 直连（或读模型/物化视图），REST 反而多一次序列化 |
| 权限模型与 UI 高度耦合（行级/字段级） | 直连 + RLS / 服务端过滤，比再造一层 API 简单 |
| 数据要被 SPA、移动 App、合作方消费；或需独立部署/独立 SLA | 保留 REST（或 GraphQL），Next 只是消费者之一 |
| 写操作有跨系统副作用（发 MQ、调外部） | 保留服务端，用 Outbox；不要散进 Server Action |

折中方案是主流：读走直连或 `fetch` + ISR，写走 REST/事件；或者「REST 是唯一真相源，Next 只做 BFF」。判断标准不是「Next 允不允许」，而是**这份数据有几个消费者、边界是否需要版本化**。

## 9. 对照 Inertia / Livewire：团队熟悉 Blade 时怎么选

| 维度 | Laravel + Blade + Alpine | Livewire 3 | Inertia + Vue/React SPA | Next.js App Router |
|---|---|---|---|---|
| 心智 | 服务端模板 | 服务端组件 + diff | 完整 SPA + props 注入 | RSC 树 + 客户端岛屿 |
| 浏览器 JS 量 | ~0 | 少（wire: 指令） | **全页组件都要打包** | 只有 `"use client"` 子树 |
| 交互边界 | 无 | 组件方法 | **整个页面** | 一个组件（本项目 OrderForm） |
| 数据获取 | Controller | `mount()` | Controller → `Inertia::render` | RSC 里 `await` |
| 提交 | route + Controller + redirect | `wire:submit` | `router.post` + 闪存 | Server Action + `useActionState` |
| TypeScript 体验 | 无 | 无 | 中（类型靠 API 层） | **端到端类型 + 类型化路由** |
| 学习迁移成本 | — | 极低（PHP 语法） | 低（Controller 不变，只换视图） | 高（换运行时、换部署模型） |
| 何时选它 | 表单/报表为主的后台 | 传统 Laravel 团队要「交互」但不想上 SPA | Laravel 团队要 React 组件生态 | 新项目、需要边缘渲染/独立全栈 |

务实建议：**团队已经在 Blade 上、目标是「页面更好交互」→ Livewire**；**目标是「用 React 组件库 + 保持 Laravel 后端」→ Inertia**；**目标是「TS 全栈一套、边缘渲染、RSC 流式」→ Next，且要接受部署形态从 php-fpm 变成 Node 常驻进程**。本章是第三种的完整样本。

## 10. 工程化：dev / build / start、standalone、Turbopack

[package.json](../code/web-next/package.json) 的四个脚本：

```json
"dev": "next dev -p 3100",
"build": "pnpm --filter @shop/shared build && next build",
"start": "next start -p 3100",
"typecheck": "pnpm --filter @shop/shared build && tsc --noEmit"
```

| 命令 | 干什么 | 注意 |
|---|---|---|
| `next dev` | Turbopack dev server，HMR + 按需编译；也会写 `AGENTS.md` 之类的开发期文件 | 与生产行为**不等价**（未做静态化、缓存指令宽松） |
| `next build` | Turbopack 编译 + **自己跑一遍 TypeScript 检查** + 生成路由清单/类型 + server bundle | `Route (app)` 表格是唯一可信的静态/动态判据 |
| `next start` | 生产 Node server，跑 `.next` 产物 | 不是 `php artisan serve` 那种「开发服务器」，可用于生产 |
| `next build` 后 `output: "standalone"` | 生成只含必要依赖的 `standalone/server.js` | Docker 镜像瘦身的关键；本仓库未开（演示用） |

真实构建输出（本仓库 `/` 因 `force-dynamic` 被判为动态）：

```
Route (app)
┌ ƒ /
└ ○ /_not-found
```

图例：`○` 静态预渲染、`●` 静态且有动态参数、`ƒ` 服务端函数（动态）、`⚠` 未找到配置。对照 Laravel：这张表就是 `php artisan route:list`，但它附带「是否静态化」这一维度——部署后是否消耗 CPU、能否丢给 CDN，一眼可见。

- `next build` 的 TypeScript pass 与仓库的 [tsconfig.json](../code/web-next/tsconfig.json) 是配合关系：`"plugins": [{ "name": "next" }]` 让 IDE 用 Next 的语言服务、`jsx: "preserve"`（编译交给 Turbopack）、`incremental: true`（副产物 `tsconfig.tsbuildinfo` 别提交）、`allowJs: true`，并且 Next 会**自己写** `next-env.d.ts`（文件头注明「should not be edited」）。因为 Next 已经做检查，`typecheck` 脚本里的 `tsc --noEmit` 定位是「编辑器之外的显式第二道门」，两者不冲突。
- 这里**没有** Vue 那种 TS 版本妥协：`next` 16.4.3 + `typescript` 7.0.2 一起工作正常，`build` 与 `typecheck` 都是绿的。第 12 章的 vue-tsc 事故之所以没在这里重演，是因为 Next 的检查走的是「框架自己调用编译器」，不依赖第三方 fork 的 JS 编译器 API。

## 11. 常见坑速查

| 坑 | 现象 | 正解 |
|---|---|---|
| 在 RSC 里写事件处理器 | `onClick={...}` / `useState` 出现在无指令文件 → 构建报错或静默失效 | 拆出 `"use client"` 子组件（本项目就是这么拆 OrderForm 的） |
| 客户端组件 import 服务端模块 | 机密进 bundle，或 Node API 在浏览器抛错 | 装 `server-only` 并在数据层首行 import；本仓库靠约定（已知缺口） |
| `process.env` 在客户端 | `undefined`（或构建期被替换成空） | 只有 `NEXT_PUBLIC_*` 会内联进浏览器；其余只在服务端读。本项目的 `SHOP_PASSWORD` 故意只留在 `lib/api.ts` |
| `"use server"` 里导出常量 | 客户端拿到 server reference 代理，`Object.keys(...)` 抛错（见 3.4） | 常量/类型放无指令模块 |
| 忘了 `await` / 动态段类型 | 表格渲染成 `[object Promise]`；`params` 在 Next 15+ 也是 Promise | `async` Server Component 里数据必须 await（`page.tsx` 用 `Awaited<ReturnType<typeof fetchProducts>>` 给 `let` 标注类型）；路由参数写 `const { id } = await params;` |
| `fetch` 默认缓存导致「库存不变」 | 生产里 Next 会缓存 GET fetch | 显式 `cache`/`revalidate`/`tags`；本项目用 `no-store` |
| 测试 | RSC/Action 单测别扭 | 单测留给纯函数 + schema（[test/api.test.ts](../code/web-next/test/api.test.ts) 4 例），e2e 用 Playwright（官方推荐，本仓库不引入，见第 09 章取舍） |

## 12. 本章小结

| 主题 | 一句话 |
|---|---|
| 路由 | 文件即路由；`page/layout/[段]/(组)/route.ts` 各自语义明确 |
| RSC 边界 | `"use client"` 是**打包边界**而非「运行位置」，边界靠可序列化 props；`"use server"` 模块只导出 async 函数 |
| Server Action | 表单 POST 回函数，取代 route + Controller + redirect + flash |
| 缓存 | fetch / 渲染 / revalidate / HTTP 四层，别用 OPcache 的心智去套 |
| 架构 | 全栈 Next 允许直连 DB；本仓库保留 REST 换取「三端复用 + 与 Java 版对齐 + 边界稳定」（Next 16.4.3 + React 19.3.1 + Turbopack，`next build` 自带 TS pass，与 TS 7.0.2 无冲突） |

下一章把三端共同依赖的那块拼图打开：`@shop/shared` 与 monorepo 工程化。
