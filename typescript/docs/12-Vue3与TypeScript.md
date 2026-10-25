# 12 Vue 3 与 TypeScript

> **配套代码（web-vue）**
> 依赖与脚本：[package.json](../code/web-vue/package.json)　构建与代理：[vite.config.ts](../code/web-vue/vite.config.ts)　TS 配置：[tsconfig.json](../code/web-vue/tsconfig.json)　入口页：[index.html](../code/web-vue/index.html)
> 入口与根组件：[main.ts](../code/web-vue/src/main.ts)、[App.vue](../code/web-vue/src/App.vue)　子组件：[OrderPanel.vue](../code/web-vue/src/components/OrderPanel.vue)
> 状态：[stores/catalog.ts](../code/web-vue/src/stores/catalog.ts)　数据层：[api.ts](../code/web-vue/src/api.ts)　store 单测：[test/catalog.test.ts](../code/web-vue/test/catalog.test.ts)
> 契约来自共享包：[packages/shared/src/product.ts](../code/packages/shared/src/product.ts)、[decimal.ts](../code/packages/shared/src/decimal.ts)（第 14 章）
> 端口：Vite dev server 跑在 **3010**，`/api` 代理到 `http://localhost:8080`（shop-api 没开 CORS，和 Java 版一样）

## 1. 概念映射：Blade + 一点 Alpine → SFC

你在 Laravel 里大概是这么写「一个能交互的商品表格」的：Blade 模板 + `@foreach` + 一段 Alpine 的 `x-data`，复杂了再补 jQuery。Vue 3 把这三层收成一样东西——单文件组件（SFC）。

| Laravel / Blade / Alpine | Vue 3 SFC |
|---|---|
| `resources/views/products/index.blade.php` | `App.vue`（根组件）+ `components/*.vue` |
| `@include('partials.order-panel')` | `<OrderPanel :product="..." @submit="..." />` |
| `@yield('content')` + `layout.blade.php` | `<slot />` + `App.vue` 作为布局壳 |
| Blade 的 `{{ $product->name }}` | `{{ product.name }}`（同样会转义）；`v-if` / `v-for` 是内置指令，Blade 没有 |
| `x-data="{ qty: 1 }"` + `x-model` + `x-on:click="save()"`（Alpine） | `ref(1)` + `v-model` + `@click="save()"`（Vue 内置，且全程带类型） |
| Alpine 从 `window` 或 `data-*` 拿后端数据 | Pinia store + `fetch` 打 API |
| `mixins`/全局 `window.App` 传状态 | Pinia（`defineStore`） |
| `php artisan` 编译视图、`view:cache` | `vue-tsc`（类型检查）+ `vite build`（打包）；Blade 里 `$x->foo` 拼错=运行时 500，这里=编译期报错 |

**最大的心智变化**：Blade 是「字符串模板，最后编译成 PHP 闭包」，SFC 是「一个真实的 TypeScript 模块，模板是它的 `render` 函数」。所以模板里的表达式参与类型检查——这是本章几乎所有「Vue 特有的 TS 坑」的根源，也是它值钱的地方。

## 2. `<script setup lang="ts">` 编译期发生了什么

[App.vue](../code/web-vue/src/App.vue) 的脚本块（节选）：

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useCatalogStore } from "./stores/catalog";
import type { ProductResponse } from "@shop/shared";

const catalog = useCatalogStore();
onMounted(() => { void catalog.load(); });

function formatAmount(amount: string): string {
  return `¥${Number(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
</script>
```

没有 `export default { data() {...}, methods: {...} }`。顶层的 `const`/`function` **自动**成为模板作用域。@vitejs/plugin-vue 6.0.10 把它编译成大致这样（下面是编译产物示意，不是仓库文件）：

```
export default {
  setup(__props, { expose }) {
    // 顶层语句被原样搬进 setup()
    const catalog = useCatalogStore();
    onMounted(() => { void catalog.load(); });
    function formatAmount(amount) { ... }
    return { catalog, formatAmount };   // ← 模板拿到的绑定
  },
}
```

关键点三条：

1. **`lang="ts"` 只是开关**，真正的类型检查来自 `vue-tsc` 而不是 `tsc`。`tsc` 根本不认识 `.vue` 后缀。所以 [package.json](../code/web-vue/package.json) 里两条脚本都是 `vue-tsc --noEmit`：

```json
"build": "pnpm --filter @shop/shared build && vue-tsc --noEmit && vite build",
"typecheck": "pnpm --filter @shop/shared build && vue-tsc --noEmit",
```

对照 React 版 [../code/web-react/package.json](../code/web-react/package.json) 用的是 `tsc --noEmit`——因为 JSX 是 TS 原生语法，`.tsx` 不需要额外工具链。**Vue 的 SFC 是「自定义文件扩展名 + 编译器宏」，代价就是必须有一个 fork 出来的检查器**（见第 7 节，这个代价这次真的爆掉了）。

2. **`defineProps` / `defineEmits` / `defineExpose` / `defineSlots` / `withDefaults` 是编译器宏**，不是导入函数：脚本里没有 `import`，编译器在 AST 层识别它们并生成运行时声明。宏的返回值是普通值，所以 `const emit = defineEmits<...>()` 完全合法。

3. **`<script setup>` 默认是闭包的**：父组件只能通过 props/emits 与它通信，除非显式 `defineExpose`。这就是它比 `export default {}` 更像「模块」的原因，也解释了为什么下面这个坑会存在：宏**不能**在条件语句、循环或回调里调用（编译器要静态求值）。

## 3. defineProps / defineEmits 的泛型写法

[OrderPanel.vue](../code/web-vue/src/components/OrderPanel.vue) 用的是 Vue 3.3+ 的纯类型声明式：

```ts
import type { ProductResponse } from "@shop/shared";

defineProps<{
  product: ProductResponse | null;
  quantity: number;
  previewTotal: string | null;
  submitting: boolean;
  canSubmit: boolean;
}>();

const emit = defineEmits<{
  changeQuantity: [value: number];
  submit: [];
}>();
```

| 概念 | Laravel / PHP | Vue 3 泛型宏 |
|---|---|---|
| 组件入参 | Blade partial 的 `@include(..., ['product' => $p])`（数组，无检查） | `defineProps<{...}>()` |
| 必填 / 可选 | 无概念（缺 key 就是 undefined） | `foo: T` 必填，`foo?: T` 可选，`withDefaults()` 给默认值 |
| 组件出参 | 事件（Event Dispatcher）或 flash | `defineEmits<{ 事件名: [载荷类型] }>()`；`[value: number]` 里的名字只用于报错信息，位置才是契约 |
| 无载荷事件 | — | `submit: []`（空元组，多传参数会报错） |

**父组件侧（[App.vue](../code/web-vue/src/App.vue)）**：

```vue
<OrderPanel
  :product="catalog.selected"
  :quantity="catalog.quantity"
  :preview-total="catalog.previewTotal"
  :submitting="catalog.submitting"
  :can-submit="catalog.canSubmit"
  @change-quantity="catalog.quantity = $event"
  @submit="catalog.submit()"
/>
```

坑（都是 Vue 独有的，React 没有）：

- **camelCase 声明，kebab-case 使用**。`previewTotal` prop 在模板里写 `:preview-total`；`changeQuantity` 事件监听写 `@change-quantity`。HTML 不区分大小写，所以 Vue 双向兼容，但团队里必须统一风格（本仓库：props 用 kebab，事件用 kebab）。
- **`$event` 的类型来自 emit 元组**。这里 `$event` 是 `number`，所以 `catalog.quantity = $event` 能通过检查。如果 emit 声明成 `changeQuantity: [value: string]`，这一行立刻红。
- **传 DOM 元素原生事件时 `$event` 是 `Event`，不是 `EventTarget`**。于是有了这个丑但必要的写法（OrderPanel 第 50 行）：

```vue
@input="emit('changeQuantity', Number(($event.target as HTMLInputElement).value))"
```

`($event.target as HTMLInputElement)` 是 Vue 模板类型检查的头号日常 wart：模板表达式的上下文类型是 `Event`，而 `target` 是 `EventTarget | null`，TS 无法从 `v-on` 推断「这个 input 的 target 就是 HTMLInputElement」，只能手 cast。更干净的解法是不要从模板拼业务逻辑——本仓库把 `@input="onSearch"` 提到 App.vue 的函数里，同样要 cast（第 30 行），但只 cast 一次且可测。第三种解法是 `v-model`，它把这件事彻底吃掉了（见第 8 节）。

## 4. 响应式：PHP 的值语义在这里全部失效

这是本章对 10 年 PHP 老兵最危险的一节。

### 4.1 PHP 的赋值语义 vs JS 的引用语义

```php
// PHP：对象按句柄复制，数组按值复制
$a = ['price' => 599.00];
$b = $a; $b['price'] = 0;   // 复制数组 —— $a 不受影响
```

```ts
// TS：一切都是引用（原始值除外）
const a = { price: "599.00" };
const b = a; b.price = "0.00";   // 同一个对象 —— a.price 也变了
```

在 Vue 里，`ref` / `reactive` 靠 **Proxy** 拦截属性读写来建立依赖图，因此：

- `const p = props.product` 拿到的是同一个对象引用，**在子组件里改 `p.name` 会污染父级 store**（而且 Vue 会警告「避免直接修改 props」）。
- 派生新状态要**创建新对象**，不要原地改：本仓库 store 里 `products.value = await fetchProducts(...)`（[catalog.ts](../code/web-vue/src/stores/catalog.ts) 第 47 行）是**整体替换数组引用**，不是 `push`——这样 Vue 才能一次通知所有依赖。
- `readonly(catalog.products)` 只是关掉 Proxy 的写通道并降级为普通对象的告警，运行时不会冻结，别当安全边界用（安全边界永远是第 14 章的 schema）。

### 4.2 `ref` / `computed` / `watch`

| PHP/Laravel 类比 | Vue | 语义 |
|---|---|---|
| `$model->full_name`（accessor，每次重算） | `computed(() => ...)` | 有缓存的 accessor，依赖变了才重算 |
| Eloquent 属性赋值 | `ref(x)` + `.value = y` | 值容器；写它才会触发更新 |
| Mutator / 事件监听 | `watch(source, cb)` | 副作用（打请求、埋点） |

真实代码（store 的派生段）：

```ts
const products = ref<ProductResponse[]>([]);
const quantity = ref(1);

const selected = computed(() => products.value.find((p) => p.id === selectedId.value) ?? null);

const previewTotal = computed(() => {
  const product = selected.value;
  if (!product) return null;
  return multiplyDecimalByInt(product.price, quantity.value);
});
```

注意 **脚本里一律 `.value`**（`products.value.find(...)`、`quantity.value`），**模板里一律不带 `.value`**（`{{ product.name }}`、`catalog.quantity`）。这是自动 unwrap 造成的错觉，见下一节。

`watch` 在本仓库没被使用是有意的：`App.vue` 里搜索变更是显式调用 `void catalog.load()`：

```ts
function onSearch(event: Event): void {
  catalog.search = (event.target as HTMLInputElement).value;
  void catalog.load();
}
```

换成 `watch` 的等价写法（示意，仓库里不这么做）是 `watch(() => catalog.search, () => void catalog.load())`。差别：`watch` 默认**异步**（下一个微任务批量刷新后执行），且要额外管理 `unwatch` 生命周期；显式调用则「谁改谁负责」，读代码时看不出魔法。**建议**：只有「多处改同一个源」或「需要 `immediate`/`deep`」时才上 `watch`；否则显式调用更好排查。`watchEffect` 更是要慎用——它把依赖藏进回调里，出问题很难定位。

### 4.3 `toRef` / `toRefs` / `readonly` 与解构陷阱

`catalog.quantity = 3` 与 `catalog.$patch({ quantity: 3 })`（后者可被 devtools 记录）都是合法的 store 写法。工具函数分工：

| API | 作用 | 什么时候用 |
|---|---|---|
| `toRef(obj, "key")` | 把普通对象的一个属性变成可写 ref | props 转 `v-model`、把 store 字段塞进子组件双向绑定 |
| `toRefs(obj)` | 批量转，保持响应性 | 从 `reactive` 对象「解构而不丢响应性」 |
| `storeToRefs(store)` | 只转 state/getters，**函数留在原对象上** | 想在模板里少写 `catalog.` 前缀 |
| `readonly(x)` | 返回只读 Proxy，写操作只警告 | 把 store 状态单向传给展示组件 |

**最大的坑（PHP 人会 100% 踩一次）**：

```ts
const { quantity, load } = useCatalogStore();  // ❌ quantity 丢了响应性（普通值拷贝）
const { products, search } = storeToRefs(catalog); // ✅ 得到 ref，模板里仍写 catalog 名
await load(); // ✅ 动作不要 storeToRefs，它是函数
```

Blade/PHP 里解构（`extract()`、list）从来不改变语义；这里解构直接切断依赖图。规则记一句话：**状态用 `storeToRefs`，动作直接解构**。

另外 Pinia 的 store 本身已经是 unwrap 过的——脚本里也是 `catalog.quantity = 3`，不是 `catalog.quantity.value = 3`。它和普通 `ref()` 行为不同，这一点官方文档讲得比代码讲得晚，很多人靠试错学会。

## 5. Pinia：setup store、为什么不是 Vuex、边界在哪

### 5.1 setup store（本仓库写法）

[stores/catalog.ts](../code/web-vue/src/stores/catalog.ts)：

```ts
export const useCatalogStore = defineStore("catalog", () => {
  const products = ref<ProductResponse[]>([]);
  const search = ref("");
  const loading = ref(false);
  // ...
  return { products, search, loading, submitting, error, fieldErrors, selectedId, quantity,
           lastOrder, selected, previewTotal, canSubmit, load, submit, select };
});
```

`return` 那个对象就是这个 store 的**公开 API**。没列进去的一律外部不可见——这在 option store 里做不到。

### 5.2 option store（老写法，等价对照）

| setup store（推荐） | option store |
|---|---|
| `const x = ref(0)` | `state: () => ({ x: 0 })` |
| `const y = computed(...)` | `getters: { y: (s) => ... }` |
| `async function load() {...}` | `actions: { async load() {...} }` |
| `return { load }` 控制可见性 | 全部公开 |
| 类型：TS 直接推断，无需 `this` | 类型：`this` 的循环推断常出错，要显式标注 |
| 组合：`const other = useOther(); other.do()` | 组合：`this.$store.dispatch(...)` |

option store 的唯一优点是能整块 `mapState`/Vuex 迁移工具兼容。新项目直接 setup store。

### 5.3 为什么不是 Vuex

| 维度 | Vuex 4 | Pinia 4.1.0 |
|---|---|---|
| 样板 | `mutations` + `actions` + `commit` 双层 | 只有 `actions`（可直接改 ref） |
| `modules` 嵌套 + 命名空间字符串 | store id 就是命名空间，无嵌套 |
| TypeScript | 需要 `InjectionKey` 手动泛型传递 | 组合式函数，天然类型 |
| 维护状态 | 官方已不推荐 | Vue 官方状态管理（含 devtools / `$patch`） |

Vuex 的 `mutations` 存在的理由是「让状态变更可被同步追踪」。Pinia 用 Proxy + devtools 实现了同样的可观测性，于是砍掉了这一层。**PHP 视角**：这相当于把「Event + Listener」和「直接赋值」合成一层，代价是你要自己保证在 action 里改状态（本仓库所有写操作都在 store 函数里，组件只调用）。

### 5.4 职责边界：Pinia vs React Query（TanStack Query）

这一点必须说清，否则两年后你会得到一个「什么都塞进去」的巨型 store。

| 状态类型 | 归属 | 本仓库 |
|---|---|---|
| 服务端数据（列表、详情） | 缓存层（React Query / SWR / 未来的 `@tanstack/vue-query`） | 放在了 Pinia（见下） |
| 请求中/错误/字段错误 | 同上，query/mutation 自带 | 手写在 store（`loading`/`error`/`fieldErrors`） |
| 跨组件 UI 状态（选中项、筛选词、草稿数量） | Pinia | ✅ 正是 `selectedId`/`search`/`quantity` |
| 组件内部一次性状态 / 路由 URL 状态 | 组件内 `ref` / router query | ✅ 表单细节；本项目无 router |

React 版 [../code/web-react](../code/web-react) 用 `@tanstack/react-query` 5.104.5，于是那三个「loading/error/重试」状态是库给的；Vue 版为了对齐行为，就把它们写进了 store。**结论**：这不是 Vue 优于 React 或反之，而是同一职责的两种归属。真实项目里我的建议是——服务端数据交给 query 层（缓存、失效、分页、竞态它都解决得比你好），Pinia 只留「客户端状态」；本项目为了横向对比才把两者合并进一个 store。

### 5.5 store 的单元测试（不碰 DOM）

[test/catalog.test.ts](../code/web-vue/test/catalog.test.ts) 是本章我最想让你抄的部分：

```ts
vi.mock("../src/api", () => ({ ApiProblem: class ..., fetchProducts: vi.fn(), placeOrder: vi.fn(), formatAmount: ... }));
const { fetchProducts, placeOrder, ApiProblem } = await import("../src/api");

beforeEach(() => {
  setActivePinia(createPinia());   // 每个用例一个新容器
  vi.clearAllMocks();
});

it("select 之后能算出小计（走共享包的整数分乘法）", async () => {
  vi.mocked(fetchProducts).mockResolvedValue([keyboard]);
  const store = useCatalogStore();
  await store.load();
  store.select(keyboard);
  store.quantity = 3;
  expect(store.previewTotal).toBe("1797.00");
  expect(store.canSubmit).toBe(true);
});
```

**没有 jsdom、没有 `mount()`**：`setActivePinia(createPinia())` 就是「重新开一个作用域」，剩下的全是纯逻辑。心智完全等价于 Laravel 里「测 Service 而不是测 Blade」：视图层交给 e2e/手工，业务编排单测。3 个用例全绿（`pnpm --filter @shop/web-vue test`）。

两个细节值得注意。其一，fixture 不直接写对象字面量：

```ts
const keyboard = ProductResponseSchema.parse({ id: 1, sku: "SKU-001", name: "机械键盘", price: 599, stock: 20, version: 0 });
```

因为 `price` 的类型是**品牌类型** `DecimalAmount`，字面量 `599` 或 `"599.00"` 都不能赋值给它，必须走 schema 的 `transform`（第 14 章）——「类型系统故意阻止你绕过契约」的正向案例。其二，错误分支同样能纯逻辑断言：

```ts
vi.mocked(placeOrder).mockRejectedValue(new ApiProblem(409, "库存不足", "...", { "items[0].quantity": "必须小于或等于 99" }));
await store.submit();
expect(store.error).toBe("库存不足（HTTP 409）");
expect(store.fieldErrors["items[0].quantity"]).toBe("必须小于或等于 99");
expect(store.lastOrder?.id).toBe(7); // 失败不清空上一次成功结果
```

## 6. 端到端类型在 UI 里的样子

`product.price` 在**每一处 UI 代码里都是 `string`**，不是 `number`——因为 [ProductResponseSchema](../code/packages/shared/src/product.ts) 用 `PositiveAmountSchema` 把线上 JSON 数字 `599` transform 成了 `"599.00"`：

```ts
// App.vue：函数签名就写着 string
function formatAmount(amount: string): string {
  return `¥${Number(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

如果你手滑写了 `product.price * quantity`（PHP 里很自然），TypeScript 直接报错，逼你改用 `multiplyDecimalByInt(product.price, quantity.value)`。金额永远不做浮点乘法这件事，从「团队约定 + code review」升级成了「编译不过」。这是共享包最直接的收益。

## 7. 本章最真实的一课：vue-tsc 与 TypeScript 7 不兼容

现场还原（这也是我推荐你先读这节的理由——它是全书唯一的「生态追赶」实录）：

- TypeScript 7 是 **Go 原生编译器**（tsgo），它**不再暴露 JS 编译器 API**，即 `package.json` 的 `exports` 里没有 `./lib/tsc.js` 这类条目。
- `vue-tsc` 3.3.13 在启动时执行 `require.resolve("typescript/lib/tsc")` 来拿到内部 `tsc` 行为。
- 于是解析成功但导出被拒：**`ERR_PACKAGE_PATH_NOT_EXPORTED`**，工具直接崩溃，连报错信息都不是「类型错误」而是模块解析错误。

同一个 workspace 里，`typescript-eslint` 8.72.0 有一模一样的问题（[../code/tools/eslint-config/index.mjs](../code/tools/eslint-config/index.mjs) 的注释里记着）。

**本仓库的解法：side-by-side（并置安装）**。

| 包 | `typescript` 版本 | 用哪个检查器 | 为什么 |
|---|---|---|---|
| 仓库根 | 7.0.2 | — | 默认工具链走新版 |
| `@shop/shop-api` | 7.0.2 | `tsc` | Nest 只要 `tsc`，无需 JS API |
| `@shop/web-react` | 7.0.2 | `tsc --noEmit` | JSX 原生支持 |
| `@shop/web-next` | 7.0.2 | `next build` + `tsc` | Next 自己跑检查 |
| `@shop/shared` | 7.0.2 | `tsc -p tsconfig.build.json` | 纯类型/值编译 |
| **`@shop/web-vue`** | **6.0.3（只在包内）** | **`vue-tsc --noEmit`** | vue-tsc 依赖 JS 编译器 API |
| **`@ts/eslint-config`** | **6.0.3（只在包内）** | typescript-eslint | 同上，解析器要 JS API |

能这么做的前提是 pnpm 的**隔离布局**：每个包有自己的 `node_modules`，依赖向上解析。于是 `web-vue/node_modules/typescript` 是 6.0.3，仓库根是 7.0.2，`tsc` 与 `vue-tsc` 各取所需、互不干扰。我在本机验证过目录里的实际版本：`web-vue/node_modules/typescript` → `6.0.3`，根 `node_modules/typescript` → `7.0.2`；lockfile 里 `@vitejs/plugin-vue` 也明确挂在 `vue@3.5.44(typescript@6.0.3)` 上。

用 `typescript: catalog:` 或 pnpm `overrides` 统一版本在这里是**错解**：会把后端一起拖回 TS 6，或者把 Vue 前端拖进崩溃。正确做法就是让「不兼容的叶子」在自己包里锁住，并写清原因：

```json
// ../code/web-vue/package.json（节选）"devDependencies"
{ "typescript": "6.0.3", "vue-tsc": "3.3.13", "vite": "8.3.5", "@vitejs/plugin-vue": "6.0.10" }
```

**给你的判断框架**（比记住这个 bug 有用）：工具链分两类——只用「编译器公开行为」的（`tsc`、打包器）能第一时间吃新版本；依赖「JS 编译器 API」的（vue-tsc、typescript-eslint、各类 codemod、旧版 ts-node）必须等上游适配。你选新 TS 版本前，先查自己的依赖里有没有第二类。

## 8. 其他 Vue 特有的 TS 坑清单

| 坑 | 现象 | 处理 |
|---|---|---|
| 模板自动 unwrap | 模板里 `catalog.quantity`，脚本里 `catalog.quantity.value`（普通 ref 时） | 统一走 store，store 已帮你 unwrap；写自定义 `v-model` 时用 `computed({get,set})` |
| `$event` 类型宽 | `(event.target as HTMLInputElement)` 必须手 cast | 把逻辑提到 `function onSearch(event: Event)`，只 cast 一次 |
| props 只读 | 直接改 props 会警告 + 类型上 `readonly` | 用 emit 通知父级（本仓库 `@change-quantity`） |
| `v-for` 的 key / `defineProps` 的外部变量 | 缺 key 无类型错误但运行期 diff 退化；宏参数「必须完全可静态求值」，引用外部变量直接编译失败 | `:key="product.sku"`（稳定业务键，不用 index）；类型用 `import type` 导入即可，值默认值走 `withDefaults` |
| style 作用域 | `App.vue` 用的是普通 `<style>`（全局） | 组件多了以后换 `<style scoped>` 或 CSS Modules |

## 9. ESLint 的取舍：没装 eslint-plugin-vue

[../code/web-vue/eslint.config.mjs](../code/web-vue/eslint.config.mjs) 的全部内容就是：

```js
export { default } from "@ts/eslint-config";
```

也就是说：共享包 [../code/tools/eslint-config/index.mjs](../code/tools/eslint-config/index.mjs) 只配了 `@eslint/js` + `typescript-eslint`，**`.vue` 文件根本没有 parser**（默认扁平配置只 lint `.js`/`.ts`）。这是有意为之的演示项目决策，理由：

1. 装了 `vue-eslint-parser` 就要保证它和 `typescript-eslint` 的版本三角关系成立，同时 `vue-tsc` 已经锁了 TS 6，再引一个 parser 会把这个包变成「生态兼容矩阵的展品」而不是「Vue 类型的展品」；而模板层错误（未使用变量、props 类型）vue-tsc 已经覆盖大半，重复收益低。
2. 不 lint `.vue` 的**代价必须写清**：`v-for` 缺 key、`v-if` 与 `v-for` 同元素、`this` 误用、模板里裸 `console.log`、`<script setup>` 里的 `unused-vars` 这些规则全部不生效。

生产项目我会装（`vue-eslint-parser` + `eslint-plugin-vue` 的 `plugin:vue/vue3-recommended`），并接受它带来的 TS 版本约束。这里把它记成「已知缺口」，比偷偷不做诚实。

## 10. 构建、产物与体积观察

- `pnpm --filter @shop/web-vue build` 的实际链路是 `shared build → vue-tsc --noEmit → vite build`（先看契约、再看类型、最后打包，顺序不能反）。
- 构建通过，产物落在 `web-vue/dist/`：入口 JS **166,233 字节**（166.23 kB，gzip 55.77 kB），因为 [vite.config.ts](../code/web-vue/vite.config.ts) 开了 `sourcemap: true`，旁边还挂着约 **1.18 MB** 的 `.js.map`；CSS 只有 1.2 kB。
- 166 kB 是什么概念？这就是 `vue` + `pinia` + `zod` 三个运行时全打进去、且**没有做任何代码分割**的结果。真实项目要动的是：`zod` 换成按需 schema（或只在 dev 校验）、路由级 `defineAsyncComponent` 拆分、生产关掉 sourcemap 或上传到错误平台。
- 一个**实测到的体积变化**值得单独记：同一条命令在 `@shop/shared` 还是 CommonJS 产物时报的是 618 kB，改成 ESM 之后降到 166 kB。原因是 bundler 对 CJS 模块**无法 tree-shake**（`export *` 的 re-export 图在 CJS 里是不透明的），整包 zod 被拖了进来。这组数字没有逐变量复测（同期还改了 `exports` 字段），当量级参考而不是精确归因——但「共享包发 ESM 能显著减小前端体积」这条结论可以放心用。
- `index.html` 是 Vite 的入口壳（`<div id="app">` + `<script type="module" src="/src/main.ts">`），角色等于 Laravel 的 `app.blade.php`，但**没有服务端模板**——HTML 里没有业务数据，数据全靠 `fetch`。这是「SPA」和下一章「SSR/RSC」的分水岭。
- dev 期依赖 Vite proxy（`/api` → 8080）绕过同源限制，因为 shop-api 没开 CORS；部署时换成 Nginx 反代或后端开 CORS。凭据走 `import.meta.env.VITE_SHOP_USERNAME`（[api.ts](../code/web-vue/src/api.ts)）——**`VITE_` 前缀的变量会被编译进公开 bundle**，Basic auth 放前端只适合演示，详见第 13 章对 `process.env` 的讨论。

## 11. 本章小结

| 主题 | 一句话 |
|---|---|
| SFC | 模板是 TS 模块的一部分，所以类型检查需要 `vue-tsc` |
| 宏 | `defineProps<T>()` / `defineEmits<T>()` 编译期生成运行时声明，必须静态可求值 |
| 响应式 | PHP 的值语义不适用：整体替换引用、别解构 store 状态；`price: string` 由共享 schema 保证 |
| Pinia | setup store 有真实类型和显式公开 API；服务端数据理想归属是 query 层；测试靠 `setActivePinia(createPinia())` + `vi.mock`，不碰 DOM |
| 生态 | TS 7 让 vue-tsc/typescript-eslint 崩溃，用包内锁 TS 6 并置解决 |

下一站是 Next.js：它把「视图」和「后端」拉回同一台服务器，你会看到完全不同的边界划分。
