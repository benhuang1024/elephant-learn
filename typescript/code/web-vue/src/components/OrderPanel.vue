<script setup lang="ts">
/**
 * <OrderPanel> —— 组件 props / emits 的泛型写法（Vue 3.3+ 的「类型导入即 props 定义」）
 *
 * 对照 React：React 的 props 是一个函数参数类型；Vue 的 defineProps<T>() 是**编译器宏**，
 * 由 vue-tsc / SFC 编译器在编译期生成运行时声明 —— 所以 `npm run typecheck` 用 vue-tsc 而不是 tsc。
 *
 * 这里刻意**不发请求**：面板只负责「显示 + 抛事件」，业务动作留在 store，
 * 等价于「瘦组件、胖 store」（和 Laravel 的 Blade partial + controller 分层是同一诉求）。
 */
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

function formatAmount(amount: string): string {
  return `¥${Number(amount).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
</script>

<template>
  <section class="panel">
    <h2>下单</h2>
    <p>
      当前选择：
      <strong>{{ product ? `${product.name}（${product.sku}）` : "未选择" }}</strong>
    </p>

    <label class="qty">
      数量
      <input
        type="number"
        :min="1"
        :max="99"
        :value="quantity"
        :disabled="!product"
        @input="emit('changeQuantity', Number(($event.target as HTMLInputElement).value))"
      />
    </label>

    <p v-if="previewTotal">小计：{{ formatAmount(previewTotal) }}</p>

    <button type="button" :disabled="!canSubmit" @click="emit('submit')">
      {{ submitting ? "提交中…" : "提交订单" }}
    </button>
  </section>
</template>
