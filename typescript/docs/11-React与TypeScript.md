# 11 React 与 TypeScript

> **配套代码（web-react，逐文件讲）**
> [index.html](../code/web-react/index.html) · [src/main.tsx](../code/web-react/src/main.tsx) · [src/App.tsx](../code/web-react/src/App.tsx) · [src/api.ts](../code/web-react/src/api.ts) · [src/queryClient.ts](../code/web-react/src/queryClient.ts) · [src/styles.css](../code/web-react/src/styles.css) · [vite.config.ts](../code/web-react/vite.config.ts) · [tsconfig.json](../code/web-react/tsconfig.json) · [package.json](../code/web-react/package.json) · [test/api.test.ts](../code/web-react/test/api.test.ts)
> **对照代码**：Vue [App.vue](../code/web-vue/src/App.vue)、[OrderPanel.vue](../code/web-vue/src/components/OrderPanel.vue)、[stores/catalog.ts](../code/web-vue/src/stores/catalog.ts)；Next [page.tsx](../code/web-next/src/app/page.tsx)、[layout.tsx](../code/web-next/src/app/layout.tsx)、[OrderForm.tsx](../code/web-next/src/components/OrderForm.tsx)、[actions.ts](../code/web-next/src/app/actions.ts)；契约 [shared/src/product.ts](../code/packages/shared/src/product.ts)、[order.ts](../code/packages/shared/src/order.ts)、[decimal.ts](../code/packages/shared/src/decimal.ts)；服务端 [product.controller.ts](../code/shop-api/src/product/product.controller.ts)、[zod.pipe.ts](../code/shop-api/src/common/zod.pipe.ts)、[shop-api.e2e.spec.ts](../code/shop-api/test/shop-api.e2e.spec.ts)

React 侧一共 4 个 `ts/tsx` 源文件、286 行，另加一份 CSS 与一份 HTML。本章按「类型从哪来 → 状态怎么活 → 视图怎么组织 → 构建留下什么」的顺序把它们讲完，重点在**后端直觉会失效的地方**。

## 1. 逐文件导览

| 文件 | 职责 | Laravel / Spring 对照 |
|---|---|---|
| [index.html](../code/web-react/index.html) | 唯一 HTML 外壳：`<div id="root">` + `<script type="module" src="/src/main.tsx">` | `public/index.php`（框架唯一入口文件） |
| [src/main.tsx](../code/web-react/src/main.tsx) | 挂载 + 全局 Provider（`StrictMode`、`QueryClientProvider`）+ 引 CSS | `bootstrap/app.php` + `Kernel` 注册全局中间件 |
| [src/App.tsx](../code/web-react/src/App.tsx) | 页面本体：搜索、列表、下单，全用 hooks 声明数据需求 | Blade 模板 + Controller 里的视图数据编排（这里合并成一处） |
| [src/api.ts](../code/web-react/src/api.ts) | 外部世界边界：fetch、Basic 头、Zod 校验响应、problem+json → `ApiProblem` | `Http::withHeaders(...)->get()` 的封装层 / Repository |
| [src/queryClient.ts](../code/web-react/src/queryClient.ts) | 服务端状态的全局策略（`staleTime`/`retry`） | `config/cache.php` 的默认 TTL 与连接策略 |
| [src/styles.css](../code/web-react/src/styles.css) | 全局样式（没有 CSS Modules、没有 Tailwind） | `resources/css/app.css` |
| [vite.config.ts](../code/web-react/vite.config.ts) | dev server 端口 3000、`/api` proxy、`build.sourcemap` | `vite.config.js` + nginx 的 `location /api` |
| [tsconfig.json](../code/web-react/tsconfig.json) | `jsx: "react-jsx"`、`moduleResolution: "bundler"`、`types: ["vite/client"]` | 无对应（PHP 没有编译配置这一层） |
| [test/api.test.ts](../code/web-react/test/api.test.ts) | 边界测试：schema、格式化、`ApiProblem` | `tests/Unit`，但只测纯函数 |

`"types": ["vite/client"]` 是 `import.meta.env` 有类型的原因；`moduleResolution: "bundler"` 则是第 09 章那张「三种包三种 import 写法」表的第四种：**bundler 模式下 `.ts` 源码不需要写扩展名**（[api.ts](../code/web-react/src/api.ts) 里 `from "@shop/shared"`、`from "zod"` 都不带后缀），因为 Vite 自己解析。

## 2. 函数组件与 props 类型

[App.tsx](../code/web-react/src/App.tsx) 的前两行没有 `import React`：

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
```

React 19 + [tsconfig.json](../code/web-react/tsconfig.json) 的 `"jsx": "react-jsx"`（automatic runtime）意味着 JSX 编译后调用的是 `react/jsx-runtime` 的 `jsx()`，不再把 `React` 这个名字拉进作用域。只有真正要用 API 时才 import：[main.tsx](../code/web-react/src/main.tsx) 里 `import { StrictMode } from "react"` 就是为组件本身。对照 PHP：Blade 里你从不 `use Illuminate\Support\React`。

props 的三种真实写法，都在本仓库：

| 写法 | 代码 | 出处 |
|---|---|---|
| 内联对象类型（无 props 就不写） | `export function App() {` | [App.tsx](../code/web-react/src/App.tsx) 第 14 行 |
| `children` 槽位 | `export default function RootLayout({ children }: { children: ReactNode })` | [layout.tsx](../code/web-next/src/app/layout.tsx) 第 17 行 |
| interface + 内联参数类型 | `interface ProductOption { id: number; sku: string; name: string; stock: number }` + `function OrderForm({ products }: { products: ProductOption[] })` | [OrderForm.tsx](../code/web-next/src/components/OrderForm.tsx) 第 18–25 行 |

props 类型就是**函数参数类型**，所以结构化类型规则完全适用：`{ id: number; sku: string; name: string; stock: number }` 这个局部接口能接住 `ProductResponse` 的对象，因为只要求「至少这些字段」——[page.tsx](../code/web-next/src/app/page.tsx) 第 68–75 行正是把 `ProductResponse` 手动降级成 4 个字段再传给 `OrderForm`。这不是多余的重构，而是 RSC 的硬约束：**跨过服务端/客户端边界的值必须可序列化，且越少越好**。

Vue 侧对照：`defineProps<{ product: ProductResponse | null; quantity: number; previewTotal: string | null; submitting: boolean; canSubmit: boolean }>()`（[OrderPanel.vue](../code/web-vue/src/components/OrderPanel.vue)）——同一件事，宏 + 泛型参数，运行时由编译器生成声明。

## 3. 返回类型：`ReactNode`、`JSX.Element` 与 React 19 的 `React.JSX` 坑

本仓库**所有组件都省略返回类型注解**：`export function App() {`、`export default async function HomePage() {`、`export default function RootLayout({...})`。这不是偷懒，是刻意的取舍，理由三条：

1. 返回类型由 JSX 决定，写与不写对调用方没有任何信息增量（React 只要求它可渲染）。
2. 显式写就要选对命名空间。**React 19 的类型（`@types/react` 19.3.0）把 `JSX` 挪到了 `React.JSX` 下**，裸 `JSX.Element` 依赖全局命名空间，在新配置下容易变成 `Cannot find namespace 'JSX'`。三种能编译的写法：`: React.JSX.Element`、先 `import type { JSX } from "react"` 再 `: JSX.Element`、或者干脆用更宽的 `: ReactNode`（[layout.tsx](../code/web-next/src/app/layout.tsx) 的 `children: ReactNode` 用的就是它，作为「能渲染的东西」这个概念比 `JSX.Element` 更准确）。
3. 这个仓库同时开着 `verbatimModuleSyntax`（§9）与严格模式，任何「为了写注解而引入的额外 import」都要走 `import type`，收益不明显就别加。

| 场景 | 该不该写返回类型 | 推荐 |
|---|---|---|
| 页面/组件 | 不写 | 让 TS 推断，省略即正确答案 |
| 组件的 `children` | **要写**（入参是契约） | `ReactNode`（能接住字符串、数组、`null`、Promise） |
| 事件处理函数 | 可选 | `void`（写成 `JSX.Element` 会让人以为返回值有用） |
| 自定义 hook | 建议写 | 元组/对象的显式类型，方便重构 |
| 异步 RSC | 不写 | 写了要 `Promise<ReactNode>`，[page.tsx](../code/web-next/src/app/page.tsx) 选择省略 |
| 泛型组件 | 类型参数要写 | 形如 `function List<T>({ items }: { items: T[] }) { … }`——本仓库没有出现；形状参考 [generics.ts](../code/lang-basics/src/generics.ts) 的 `pluck<T, K extends keyof T>` 与 `Collection<T>` |

顺带回答「为什么 TSX 里泛型箭头函数要写 `<T,>`」：`.tsx` 里 `<T>` 会被当成 JSX 标签起点，所以尾部加逗号消歧。这是 `.tsx` 独有的语法坑，`.ts` 里不存在——本仓库的泛型都在 `.ts`（`request<T>()`、`pluck<T, K>()`），所以没碰到。

## 4. `useState` 与受控输入

```tsx
// code/web-react/src/App.tsx
const [search, setSearch] = useState("");
const [selected, setSelected] = useState<ProductResponse | null>(null);
const [quantity, setQuantity] = useState(1);
```

三行对应三个独立的状态槽，顺序即身份（§5）。受控输入的定义就是**渲染用的值来自 state，state 的变更来自 input 事件**：

```tsx
<input value={search} placeholder="例如：键盘" onChange={(event) => setSearch(event.target.value)} />
<input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
```

值得注意的两处手感：

- `useState<ProductResponse | null>(null)` 必须显式给类型参数，因为 `null` 推不出未来的形状。`selected` 在 `onChange` 里由 `setSelected(product)` 赋值，`product` 的类型来自 `products.data` 的推导（§7），整条链没有一个 `any`。
- `Number(event.target.value)`：输入框被清空时 `event.target.value === ""`，`Number("") === 0`，于是 `quantity` 变成 `0`。这一行不是 bug 演示——它把「非法值一路送到服务端」的路径留在仓库里，正好由 §10 的三层校验兜住：HTML `min={1}` 只是提示、`useMutation` 会发出去、服务端 `z.int().min(1, "必须大于或等于 1")`（[order.ts](../code/packages/shared/src/order.ts) 第 20 行）返回 400 并带上 `errors["items[0].quantity"]`。

React 的「每次渲染重新读取 state」和 Vue 的 `ref` 可变盒子形成鲜明对照：[catalog.ts](../code/web-vue/src/stores/catalog.ts) 里 `quantity.value` 才是真值，`store.quantity = 3` 是 ref 的 setter 语法糖——所以 [web-vue/test/catalog.test.ts](../code/web-vue/test/catalog.test.ts) 第 64 行能那样直接赋值。

**非受控（uncontrolled）在 Next 版里更彻底**：[OrderForm.tsx](../code/web-next/src/components/OrderForm.tsx) 用 `defaultValue` + `name`，提交时读 `FormData`（[actions.ts](../code/web-next/src/app/actions.ts) 第 37–45 行），一个 `useState` 都没有。这和 Blade 里 `<input name="quantity">` 的手感一模一样——RSC 把「受控」的需求压到最小。

事件类型方面：JSX 里内联写 `(event) => …` 时参数已被上下文推断为 `React.ChangeEvent<HTMLInputElement>`，不用标注；一旦你把 handler 抽成独立函数，就要显式写：

```tsx
// 抽出 handler 时的写法（本仓库都写在内联箭头函数里，所以看不到显式标注）
function onSearch(event: React.ChangeEvent<HTMLInputElement>): void { … }
```

Vue 模板里没有这种上下文推断，于是 [App.vue](../code/web-vue/src/App.vue) 第 30 行和 [OrderPanel.vue](../code/web-vue/src/components/OrderPanel.vue) 第 50 行都得手写收窄：`(event.target as HTMLInputElement).value`。同件事，两套手感的成因值得记住：**React 的事件类型在 JSX 的 props 签名里，Vue 的类型在编译后的模板表达式里。**

## 5. Hooks 规则与闭包陷阱

两条铁律：**只在顶层调用**（不要在条件、循环、`try` 里），**只在组件或自定义 hook 里调用**。原因是 hooks 的身份就是调用顺序——React 为每个组件实例维护一条按渲染顺序索引的状态数组，`useState` 第二次渲染时靠「我是这个组件里第 2 个 hook」找回 `selected`。条件调用会让顺序漂移，state 就串味。

> 诚实说明：本仓库的共享 ESLint 配置（[tools/eslint-config/index.mjs](../code/tools/eslint-config/index.mjs)）只有 `@eslint/js` + `typescript-eslint` 规则，**没有装 `eslint-plugin-react-hooks`**，所以这两条规则目前靠人守。真项目请装上，它把这类 bug 变成编译前的 error。

真正需要 PHP 直觉切换的是闭包。看这段：

```tsx
// code/web-react/src/App.tsx
const products = useQuery({
  queryKey: ["products", search.trim()],
  queryFn: () => fetchProducts(search.trim() || undefined),
});

const order = useMutation({
  mutationFn: () =>
    placeOrder({ customerName: "ben", items: [{ productId: Number(selected?.id), quantity }] }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  },
});
```

`mutationFn` 是一个闭包，它捕获的是**这次渲染里** `selected` 和 `quantity` 的值。用户点「提交订单」时执行的是那一次渲染留下的函数：

| 你的 PHP 直觉 | React 的现实 |
|---|---|
| 变量指向「当前值」，读到就是最新 | 每次渲染是一份**快照**，回调拿到的是它被创建那次的值 |
| 一次请求结束，闭包随之消失 | 闭包挂在按钮 `onClick` 上，活到下一次点击 |
| `async` 回调里重新读变量会得到新数据 | `await` 之后读到的仍是那份快照 |
| 状态放类字段上就行 | 组件实例不存在，状态在 React 的 hook 存储里 |

于是 React 世界有三类经典解法，本仓库用了两种：

1. **把值放进 key**（本仓库做法）：`queryKey: ["products", search.trim()]`——搜索词一变 key 就变，Query 用新 key 起一次新查询，根本不需要「在旧闭包里读新 state」。这是用数据依赖取代时序依赖。
2. **函数式更新**：`setQuantity((current) => current + 1)`，绕开快照读取（本仓库是覆盖式赋值 `setQuantity(Number(...))`，不需要）。
3. **ref 盒子**（`useRef`）：Vue 的 `ref` 天生就是这个东西，所以 [catalog.ts](../code/web-vue/src/stores/catalog.ts) 的 `async load()` 里 `products.value = await fetchProducts(...)` 不存在同类问题。

还有一处 StrictMode 带来的困惑：[main.tsx](../code/web-react/src/main.tsx) 把 `<App />` 包在 `<StrictMode>` 里，开发模式下 React 会**故意把渲染函数连续调用两次**（并双跑 effect）来暴露副作用与不纯计算。看到「日志打了两遍」别急着排查业务代码，那是 StrictMode 在替你找 bug。生产构建不会双跑。

## 6. TanStack Query 5：四个 API 就够

| API | 本仓库取值 | 语义 | Laravel 手感 |
|---|---|---|---|
| `useQuery({ queryKey, queryFn })` | `["products", search.trim()]` / `() => fetchProducts(...)` | key 是缓存身份，也是「这个查询依赖哪些值」的声明 | `Cache::remember($key, $ttl, fn () => …)` |
| `staleTime` | `5_000`（[queryClient.ts](../code/web-react/src/queryClient.ts)） | 5 秒内认为新鲜，重挂载不再发请求 | TTL 的反义词：新鲜期，不是保留期 |
| `retry` / `refetchOnWindowFocus` | `1` / `false` | 4xx 重试无意义；聚焦不重拉，演示更安静 | 无对应 |
| `useMutation({ mutationFn, onSuccess })` | `placeOrder(...)` / `invalidateQueries` | 写操作 + 显式失效 | Controller 里 `$this->cache->forget(...)` |
| `invalidateQueries({ queryKey: ["products"] })` | `onSuccess` 里 | **数组是前缀匹配**，所以 `["products"]` 会同时打掉 `["products", "键盘"]` 等所有派生 key | 没有这个「按前缀批量失效」的原生能力 |

状态机的写法也必须更新一下（Query v5 的命名）：`isPending` 表示「还没有数据」，`isError` 表示失败，`data` 只有成功后才有值；`isSuccess` 用在 mutation 上读 `order.data`。于是 App.tsx 的渲染分支是强制的三态，而不是 PHP 里 `if (isset($items))` 的补锅：

```tsx
{products.isPending ? <p className="state">加载中…</p> : null}
{order.isSuccess ? <p className="state ok">下单成功：订单 #{order.data.id}，合计 {formatAmount(order.data.total)}…</p> : null}
```

「提交后重查」在三个前端里的三种写法，正好是三种心智的对照：

| 前端 | 写法 | 出处 |
|---|---|---|
| React | `await queryClient.invalidateQueries({ queryKey: ["products"] })` | [App.tsx](../code/web-react/src/App.tsx) 第 31–34 行 |
| Vue | `submit()` 成功后直接 `await load()` 再拉一次 | [catalog.ts](../code/web-vue/src/stores/catalog.ts) 第 66 行（测试钉住 `expect(fetchProducts).toHaveBeenCalledTimes(2)`） |
| Next | Server Action 里 `revalidatePath("/")`，让这条路由的渲染缓存失效 | [actions.ts](../code/web-next/src/app/actions.ts) 第 60 行 |

同一个业务事实（库存变了），三种失效表达。选哪个取决于你把「服务端状态」放在客户端缓存、store，还是渲染缓存里。

## 7. 类型推导实战：`products.data` 的类型从哪来

不写一个泛型实参，`products.data[0].price` 却是精确类型。链路全程可查：

```ts
// code/web-react/src/api.ts —— 泛型函数：T 由 parse 回调反推
async function request<T>(path: string, init: RequestInit, parse: (data: unknown) => T): Promise<T> { … }

export function fetchProducts(q?: string): Promise<ProductResponse[]> {
  return request(`/api/products${query}`, { method: "GET" }, (data) => z.array(ProductResponseSchema).parse(data));
}
```

| 环节 | 类型 | 依据 |
|---|---|---|
| `ProductResponseSchema` | 值（Zod schema） | [product.ts](../code/packages/shared/src/product.ts) 第 14–22 行 |
| `ProductResponse` | `{ id: number; sku: string; name: string; price: DecimalAmount; stock: number; version: number }` | `z.infer<typeof ProductResponseSchema>`（同文件第 24 行） |
| `parse` 回调返回值 | `ProductResponse[]` | `z.array(schema).parse()` 的返回类型是 `z.infer` 的数组 |
| `request<T>` 的 `T` | 被反推为 `ProductResponse[]` | 第三个参数的返回类型 |
| `queryFn` 返回 | `Promise<ProductResponse[]>` | `fetchProducts` 的显式返回注解 |
| `useQuery` 的结果 | `data: ProductResponse[] \| undefined` | Query 用 `queryFn` 的 `Awaited<>` 实例化返回类型 |
| `products.data.map((product) => …)` 的 `product` | `ProductResponse` | 数组元素推断，无注解 |
| `page.tsx` 里的 `products` | `Awaited<ReturnType<typeof fetchProducts>>` | [page.tsx](../code/web-next/src/app/page.tsx) 第 16 行——手写推导的标准姿势 |

`price` 是 `DecimalAmount`（`string & { readonly [DECIMAL_BRAND]: "DecimalAmount" }`，[decimal.ts](../code/packages/shared/src/decimal.ts) 第 16 行），所以 `formatAmount(product.price)` 的入参是 `string`——品牌类型可赋给 `string`，反之不行。第 09 章说的「类型测试是哨兵」在这里有具体价值：`expectTypeOf<DecimalAmount>().toEqualTypeOf<string>()`（[decimal.test.ts](../code/packages/shared/test/decimal.test.ts) 第 60 行）钉住了「它底层就是字符串」这个事实，改了品牌写法时先在这里红。

一处必须理解的推导限制：入站 DTO 用 `z.input`，规范化结果用 `z.infer`。`CreateProductRequest = z.input<typeof CreateProductRequestSchema>` 里 `price` 可以是 `1999` 也可以是 `"1999.0"`（`DecimalInputSchema` 同时收两种），`stock` 可以整体省略；而 `CreateProductInput = z.infer<…>` 里 `price` 已经是 `DecimalAmount`、`stock` 必有值（`.default(0)` 补上了）。[schemas.test.ts](../code/packages/shared/test/schemas.test.ts) 第 29 与 33 行就是在断言这两步转换。服务端 `OrderService.place(input: PlaceOrderInput)`、`ProductService` 同理，因此能拒绝「还没校验过的裸对象」——**把「校验过」这件事编码进类型**，这是 PHP 里没有的层次。

## 8. 错误收窄：`error instanceof ApiProblem`

```tsx
// code/web-react/src/App.tsx
const problem = order.error instanceof ApiProblem ? order.error : null;
// ...
{products.error instanceof Error ? products.error.message : "未知错误"}
```

Query 默认把 `error` 类型定为 `Error`，但真正的错误是 [api.ts](../code/web-react/src/api.ts) 抛的 `ApiProblem extends Error`。`instanceof` 是 TS 认得的收窄谓词，收窄后才能读 `.title`、`.status`、`.fieldErrors`。更完整的写法在 [page.tsx](../code/web-next/src/app/page.tsx) 第 22–27 行，一条链式三元把 `unknown` 逐层剥开：

```ts
loadError =
  error instanceof ApiProblem
    ? `${error.title}（HTTP ${error.status}）：${error.message}`
    : error instanceof Error
      ? `${error.message}（shop-api 是否已在 8080 端口启动？）`
      : "未知错误";
```

| PHP | TypeScript |
|---|---|
| `catch (InsufficientStockException $e)` 直接拿到带类型的 `$e` | `catch (e)` 里 `e: unknown`（`strict` 下的 `useUnknownInCatchVariables`），必须 `instanceof` 收窄 |
| 抛非异常对象是致命错误 | `throw "字符串"` 合法，所以只能靠 `instanceof`（[error-handling.ts](../code/lang-basics/src/error-handling.ts) 就是在练这件事） |
| 类型层级 = 继承层级 | 类型层级也可靠判别字段（union + `kind`），Vue store 的 `describeError(cause: unknown)` 就是最后兜底 |

`ApiProblem` 本身的生产过程也全是收窄（[api.ts](../code/web-react/src/api.ts) 的 `toProblem()`）：`const record = (body ?? {}) as Record<string, unknown>`，然后 `typeof record["title"] === "string" ? record["title"] : "请求失败"`。**没有一句 `as string` 的强转**——因为 problem+json 的字段是可选的，`errors` 也可能根本没有。这正是第 05 章「类型会被擦除，所以边界必须校验」的落地。

## 9. `import type` 与 `verbatimModuleSyntax`

[tsconfig.base.json](../code/tsconfig.base.json) 里 `"verbatimModuleSyntax": true`、`"isolatedModules": true`，[web-react/tsconfig.json](../code/web-react/tsconfig.json) 继承之。效果：**类型导入必须写 `import type`，值导入必须是真的 import**。

| 写法 | 例子 | 什么时候用 |
|---|---|---|
| 纯类型语句 | `import type { ProductResponse } from "@shop/shared";`（[App.tsx](../code/web-react/src/App.tsx) 第 4 行） | 只用于注解 |
| 混合内联 `type` | `import { OrderResponseSchema, PlaceOrderRequestSchema, ProductResponseSchema, type OrderResponse, type PlaceOrderRequest, type ProductResponse } from "@shop/shared";`（[api.ts](../code/web-react/src/api.ts) 第 2–9 行） | 同一模块既要值（schema）又要类型（推导结果）——本仓库最常见 |
| 值导入 | `import { z } from "zod";`、`import { StrictMode } from "react";` | 运行时要用 |
| 纯类型但要 emit 装饰元数据 | 关掉 `verbatimModuleSyntax` | 见下 |

为什么 PHP 没这个问题：`use App\Models\Product;` 只是编译期别名，删不删都不影响运行。TS 的 `import` 是**运行时语句**（ESM），所以「这个 import 只是为了类型」必须写出来——否则单文件转译器（esbuild/rolldown，一次只看一个文件）无法判断能不能安全删掉它。`isolatedModules` 就是把「必须能单文件转译」变成硬性要求。

反过来，[shop-api/tsconfig.json](../code/shop-api/tsconfig.json) 把 `verbatimModuleSyntax` 设为 `false`（全仓唯一一个例外）：Nest 依赖 `emitDecoratorMetadata`，构造器参数的类型引用必须作为**值**留在产物里才能发射 `design:paramtypes`，而 `import type` 会被擦成 `[Object]`，DI 当场失效。`@shop/shared` 则是 `true`：它是纯 ESM 的契约包，没有装饰器，正好用来验证「关掉这个开关并不是共享包的必要条件」。**同一份 workspace 里不同包可以有不同的 TS 策略，这类决定写在各自 tsconfig 里而不是根配置**——这是本仓库给你的一个多包工程样本。

## 10. 表单 + Zod：客户端拦一次，服务端仍拦一次

```ts
// code/web-react/src/api.ts —— 出站前先过 schema
export function placeOrder(input: PlaceOrderRequest): Promise<OrderResponse> {
  const payload = PlaceOrderRequestSchema.parse(input);
  return request("/api/orders", { method: "POST", body: JSON.stringify(payload) }, (data) => OrderResponseSchema.parse(data));
}
```

三层各自的定位：

| 层 | 代码 | 作用 | 能绕过吗 |
|---|---|---|---|
| HTML 属性 | `min={1} max={99}`、`disabled={product.stock === 0}`、`disabled={!selected \|\| order.isPending}` | 即时反馈，减少无效点击 | 能（DevTools 改 DOM） |
| 客户端 Zod | `PlaceOrderRequestSchema.parse(input)`；测试 [api.test.ts](../code/web-react/test/api.test.ts) 第 27–35 行钉住「空购物车」「数量 100」两条 | **少一次往返**，错误形状与服务端一致 | 能（直接 curl） |
| 服务端 Pipe | `@Body(new ZodValidationPipe(CreateProductRequestSchema))`（[product.controller.ts](../code/shop-api/src/product/product.controller.ts)） | 唯一安全边界 | 不能 |

服务端拦下后的响应形状就是前端要显示的东西，两边共用 [field-errors.ts](../code/packages/shared/src/field-errors.ts) 的拍平规则（`items[0].quantity`，多条取第一条）。这条契约在 e2e 里钉着（[shop-api.e2e.spec.ts](../code/shop-api/test/shop-api.e2e.spec.ts) 第 180–194 行：`tooBig.body.errors["items[0].quantity"] === "必须小于或等于 99"`），前端把它搬进 UI（App.tsx 第 144–152 行遍历 `problem.fieldErrors`），Vue 侧一模一样（`store.fieldErrors["items[0].quantity"]`，见 [catalog.test.ts](../code/web-vue/test/catalog.test.ts) 第 98 行）。

**一次定义、四处生效**（服务端 Pipe、客户端 pre-check、后端测试、前端测试）——这就是把 schema 放进 `@shop/shared` 的全部理由，也是第 14 章的主题。

## 11. key 与列表渲染

```tsx
{products.data.map((product) => (
  <tr key={product.sku} className={selected?.sku === product.sku ? "picked" : ""}>
```

本仓库四处真实 key：`<tr key={product.sku}>`（App.tsx 第 79 行）、`<li key={field}>`（第 147 行，来自 `Object.entries(problem.fieldErrors)`）、`<option key={product.sku}>`（[OrderForm.tsx](../code/web-next/src/components/OrderForm.tsx) 第 37 行）、Vue 的 `<tr v-for="product in catalog.products" :key="product.sku">`（[App.vue](../code/web-vue/src/App.vue) 第 63–67 行）。

| 疑问 | 回答 |
|---|---|
| key 干什么 | 让 React 在两次渲染间认出「同一行」，从而复用 DOM 节点而不是重建；搜索词切换时这直接影响输入框焦点与动画 |
| 为什么用 `sku` 不用 `id` | 两个都稳定唯一。`sku` 有 DB 唯一约束（[database.ts](../code/shop-api/src/db/database.ts) 的 `sku text not null unique`），`id` 是自增主键，都合格 |
| 为什么不能用 index | 列表会过滤/排序/插入，index 一变 React 就把旧 DOM 挪到新行，出现「选中状态跟着行跑」的经典错乱 |
| 空态怎么办 | 仍要在同一 `<tbody>` 里渲染一行提示，用 `colSpan={6}`（App.tsx 第 96–101 行）——注意 JSX 里是 `colSpan` 驼峰，Vue 里是 `colspan`（[App.vue](../code/web-vue/src/App.vue) 第 80 行），HTML 属性在 JSX 中被映射成 DOM property 名 |
| Blade 为什么不需要 | 服务端整段替换 HTML，没有「跨渲染复用节点」这件事 |

顺带一条：`className`（不是 `class`）也是同一族规则——JSX 的属性名走 DOM property，所以 `htmlFor`、`colSpan`、`onChange` 都是驼峰。

## 12. 可访问性与语义（本仓库做到了哪一步）

真实做到的：`<label>` 包裹文字与 input（`<label className="search">搜索商品<input value={search} …/></label>`），所以点文字能聚焦、读屏能配对；所有非提交按钮都写 `type="button"`（第 87、125 行），因为 `<button>` 在 `<form>` 里默认 `type="submit"`——这是和 PHP 表单时代同样的坑，只是没人提醒你；表格用 `<thead>/<th>/<tbody>`，金额列 `className="num"` 配 `text-align: right` 与 `font-variant-numeric: tabular-nums`（[styles.css](../code/web-react/src/styles.css)）；[OrderForm.tsx](../code/web-next/src/components/OrderForm.tsx) 用真实 `<form action={formAction}>`，所以禁用 JS 也能提交（渐进增强）。

没做的，说清楚：没有 `aria-live` 区域，所以「下单成功/失败」的提示不会被读屏即时播报；`placeholder="例如：键盘"` 只是装饰（有 `<label>` 才算配对，单靠 placeholder 不等于可访问名字）；错误提示没有 `aria-describedby` 关联到对应输入框。生产项目要补的是这三件事 + 一条键盘可达的顺序检查。

## 13. 构建观察：Vite 8 用 rolldown，以及那条 500 KB 警告为什么曾经亮

`pnpm --filter @shop/web-react build` 跑的是 `shared build && tsc --noEmit && vite build`。Vite 8 的打包器已经是 **rolldown**（Rust 实现，取代 Rollup 的位置；`tsc` 只做类型检查，完全不参与打包）。这个仓库当前真实产出的 `dist/assets/`：

| 文件 | 大小 | 说明 |
|---|---|---|
| `index-C9smrHOu.js` | **349740 B ≈ 342 KB**（gzip 105.91 kB） | 单个 chunk，**已经低于** Vite 默认的 500 kB 警告阈值 |
| `index-C9smrHOu.js.map` | 1838581 B ≈ 1.8 MB | 因为 [vite.config.ts](../code/web-react/vite.config.ts) 写了 `sourcemap: true`；只上传到错误监控，不给用户 |
| `index-DjpxX_1c.css` | 1153 B | 与 Vue 版**同名同尺寸**：内容相同 → 哈希相同 |
| Vue 版 `index-B1fnb-ds.js` | 166233 B ≈ 162 KB（gzip 55.77 kB） | 同功能、同依赖（少了 `@tanstack/react-query`，多了 `pinia`） |

**这一节最有价值的其实是变化本身**：`@shop/shared` 还是 CommonJS 产物时，同两条命令报的是 **801579 B（React）/ 617749 B（Vue）**，并且真的触发了那条警告；shared 改成 ESM 之后变成 349 KB / 166 KB。原因是 bundler **无法对 CJS 模块做 tree-shaking**（CJS 的 `export *` / `module.exports` 图是不透明的，任何 re-export 都只能整包留下），于是 zod 与整份契约被全量烤进去。「共享包发 ESM」不只是运行时兼容问题（第 04 章 §5 的空页面），它直接决定前端体积。

那条警告（当时确实亮了）不是在说「构建失败」，它在说四件事：

1. **只有一个 chunk。** 没有 `manualChunks`，也没有动态 `import()`，所以 react + react-dom + @tanstack/react-query + zod + @shop/shared 全烤进一个文件，浏览器必须下完才能开始渲染。
2. **体积成本由用户承担。** 后端习惯是「fat jar 大一点无所谓」，因为那是运维的问题；这里几百 KB 是访问者的下载 + 解析 + 执行时间，gzip 后虽然小很多，**执行成本一分不少**。
3. **zod 是被低估的一半。** 校验库进了客户端 bundle（三个前端都直接用 schema 做响应校验）。这是「契约共享」换来的成本，值得知道价格：真正要瘦身时，先查它。
4. **单页应用的 SPA 体积优化路径是确定的**：路由级 `React.lazy`/动态 import、`build.manualChunks` 拆 vendor、只导入用到的 schema（而不是整个 `@shop/shared`）、或用 RSC 把不需要交互的部分留在服务端（本仓库 [web-next](../code/web-next/src/app/page.tsx) 只有 `OrderForm` 这一块进浏览器，就是这个思路的样本）。

诊断工具链上没有现成命令（`rollup-plugin-visualizer` 之类没装），最朴素的两步已经够用：看 `vite build` 的输出清单，再 `ls -la dist/assets`。想看细节就临时加一条 `build.chunkSizeWarningLimit` 或装可视化插件——**先知道成本，再决定要不要优化**，这和读 JVM GC 日志是同一种习惯。

## 14. 收尾：一张「类型从哪来到哪去」总账

| 来源 | 中间 | 终点 |
|---|---|---|
| [product.ts](../code/packages/shared/src/product.ts) 的 `ProductResponseSchema` | `z.infer` → `ProductResponse` → `fetchProducts` 返回 `Promise<ProductResponse[]>` → `useQuery` 推导 `data` | `<tr key={product.sku}>` 里每个字段的类型、`formatAmount(product.price)` 的入参 |
| [order.ts](../code/packages/shared/src/order.ts) 的 `PlaceOrderRequestSchema` | 客户端 `parse` 前置检查 + 服务端 `ZodValidationPipe` | `errors["items[0].quantity"]` → `problem.fieldErrors` → `<li key={field}>` |
| [problem.ts](../code/packages/shared/src/problem.ts) 的 problem+json 形状 | `toProblem()` → `ApiProblem`（`Error` 子类） | `order.error instanceof ApiProblem ? order.error : null` 的收窄 |
| [decimal.ts](../code/packages/shared/src/decimal.ts) 的 `DecimalAmount` 品牌类型 | 贯穿 store / 组件 props / 测试断言 | `multiplyDecimalByInt(product.price, quantity)` 永不出现 `number` 金额 |

这一章反复出现的只有一句话：**类型不是靠注解堆出来的，是靠「边界处一次校验 + 全程推导」长出来的。** 你要做的架构决定只有两个——把 schema 放在哪（共享包），以及在哪个位置执行它（出站前一次、入站后一次、服务端必一次）。其余的 hooks、props、key，都是这套决定在视图层的投影。
