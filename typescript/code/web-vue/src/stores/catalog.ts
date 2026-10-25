import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { multiplyDecimalByInt, type OrderResponse, type ProductResponse } from "@shop/shared";
import { ApiProblem, fetchProducts, placeOrder } from "../api";

/**
 * Pinia store（composition 写法）—— 对应 Laravel 里没有的东西，最接近的是「服务端 session + 视图数据」
 *
 * 为什么后端人容易写错状态管理：
 * - 组件只管渲染，**跨组件共享的状态**放 store（≈ 一次「带缓存的请求编排」）
 * - state 用 ref、派生用 computed（≈ Blade 里的 accessor），动作用 async function
 * - store 不是全局单例变量：它有明确的 scope 与生命周期，测试里 setActivePinia 就能重开
 *
 * 类型怎么来的：`ref<ProductResponse[]>([])` 的 ProductResponse 直接来自 @shop/shared 的 z.infer，
 * 所以「后端加字段 → 共享包改 → 这里编译报错」的链路是通的。
 */
export const useCatalogStore = defineStore("catalog", () => {
  const products = ref<ProductResponse[]>([]);
  const search = ref("");
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref<string | null>(null);
  const fieldErrors = ref<Record<string, string>>({});
  const selectedId = ref<number | null>(null);
  const quantity = ref(1);
  const lastOrder = ref<OrderResponse | null>(null);

  const selected = computed(
    () => products.value.find((product) => product.id === selectedId.value) ?? null,
  );

  /** 小计用共享包的整数分乘法，绝不在前端做浮点金额运算。 */
  const previewTotal = computed(() => {
    const product = selected.value;
    if (!product) return null;
    return multiplyDecimalByInt(product.price, quantity.value);
  });

  const canSubmit = computed(
    () => selected.value !== null && quantity.value >= 1 && submitting.value === false,
  );

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      products.value = await fetchProducts(search.value);
    } catch (cause) {
      error.value = describeError(cause);
    } finally {
      loading.value = false;
    }
  }

  async function submit(): Promise<void> {
    const product = selected.value;
    if (!product) return;
    submitting.value = true;
    error.value = null;
    fieldErrors.value = {};
    try {
      lastOrder.value = await placeOrder({
        customerName: "ben",
        items: [{ productId: product.id, quantity: quantity.value }],
      });
      await load();
    } catch (cause) {
      if (cause instanceof ApiProblem) {
        error.value = `${cause.title}（HTTP ${cause.status}）`;
        fieldErrors.value = cause.fieldErrors;
      } else {
        error.value = describeError(cause);
      }
    } finally {
      submitting.value = false;
    }
  }

  function select(product: ProductResponse): void {
    selectedId.value = product.id;
    lastOrder.value = null;
  }

  return {
    products,
    search,
    loading,
    submitting,
    error,
    fieldErrors,
    selectedId,
    quantity,
    lastOrder,
    selected,
    previewTotal,
    canSubmit,
    load,
    submit,
    select,
  };
});

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
