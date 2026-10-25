<script setup lang="ts">
/**
 * App.vue —— <script setup lang="ts"> 是 Vue 3 的推荐写法：
 * 不需要 export default { data() {} }，脚本顶层的 ref/computed/函数**自动**成为模板作用域，
 * 并且模板里的类型检查由 vue-tsc 负责（这就是为什么 web-vue 的 typecheck 不是 tsc）。
 */
import { onMounted } from "vue";
import OrderPanel from "./components/OrderPanel.vue";
import { useCatalogStore } from "./stores/catalog";
import type { ProductResponse } from "@shop/shared";

const catalog = useCatalogStore();

onMounted(() => {
  void catalog.load();
});

function formatAmount(amount: string): string {
  return `¥${Number(amount).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function choose(product: ProductResponse): void {
  catalog.select(product);
}

function onSearch(event: Event): void {
  catalog.search = (event.target as HTMLInputElement).value;
  void catalog.load();
}
</script>

<template>
  <main class="page">
    <header>
      <h1>shop · Vue 3 + Pinia + TypeScript</h1>
      <p class="hint">与 React 版共用 @shop/shared：契约一致，只是视图层不同。</p>
    </header>

    <section class="panel">
      <label class="search">
        搜索商品
        <input placeholder="例如：键盘" :value="catalog.search" @input="onSearch" />
      </label>

      <p v-if="catalog.loading" class="state">加载中…</p>
      <p v-else-if="catalog.error" class="state error">{{ catalog.error }}</p>

      <table v-else>
        <thead>
          <tr>
            <th>SKU</th>
            <th>名称</th>
            <th class="num">单价</th>
            <th class="num">库存</th>
            <th class="num">version</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="product in catalog.products"
            :key="product.sku"
            :class="{ picked: product.id === catalog.selectedId }"
          >
            <td>{{ product.sku }}</td>
            <td>{{ product.name }}</td>
            <td class="num">{{ formatAmount(product.price) }}</td>
            <td class="num">{{ product.stock }}</td>
            <td class="num">{{ product.version }}</td>
            <td>
              <button type="button" :disabled="product.stock === 0" @click="choose(product)">
                选择
              </button>
            </td>
          </tr>
          <tr v-if="catalog.products.length === 0">
            <td colspan="6" class="state">没有匹配的商品</td>
          </tr>
        </tbody>
      </table>
    </section>

    <OrderPanel
      :product="catalog.selected"
      :quantity="catalog.quantity"
      :preview-total="catalog.previewTotal"
      :submitting="catalog.submitting"
      :can-submit="catalog.canSubmit"
      @change-quantity="catalog.quantity = $event"
      @submit="catalog.submit()"
    />

    <section v-if="catalog.lastOrder" class="panel">
      <h2>最近订单</h2>
      <p class="state ok">
        #{{ catalog.lastOrder.id }} · {{ catalog.lastOrder.customerName }} ·
        {{ formatAmount(catalog.lastOrder.total) }} · {{ catalog.lastOrder.status }}
      </p>
      <ul>
        <li v-for="line in catalog.lastOrder.items" :key="line.sku">
          {{ line.sku }} × {{ line.quantity }} = {{ formatAmount(line.subtotal) }}
        </li>
      </ul>
    </section>

    <section v-if="Object.keys(catalog.fieldErrors).length > 0" class="panel">
      <h2 class="state error">表单错误</h2>
      <ul>
        <li v-for="(message, field) in catalog.fieldErrors" :key="field">
          <code>{{ field }}</code>：{{ message }}
        </li>
      </ul>
    </section>
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
  font-family: ui-sans-serif, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}

body {
  margin: 0;
  background: #f6f7f9;
  color: #1f2328;
}

.page {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 20px 64px;
}

header h1 {
  margin: 0 0 4px;
  font-size: 22px;
}

.hint {
  margin: 0 0 20px;
  color: #6b7280;
  font-size: 14px;
}

.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 14px;
}

th,
td {
  padding: 8px 6px;
  border-bottom: 1px solid #f1f2f4;
  text-align: left;
}

th {
  color: #6b7280;
  font-weight: 600;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

tr.picked td {
  background: #eff6ff;
}

input,
button {
  font: inherit;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d0d5dd;
  background: #fff;
  color: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

label {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}

.state {
  font-size: 14px;
  color: #6b7280;
}

.state.ok {
  color: #15803d;
}

.state.error {
  color: #b91c1c;
}
</style>
