import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

/**
 * 入口：createApp + Pinia
 *
 * 对照 React 版：React 需要一个 Provider 包起来，Vue 用 app.use(plugin) ——
 * 两者都是「把状态容器挂到组件树上」，只是显式程度不同。
 */
const app = createApp(App);
app.use(createPinia());
app.mount("#app");
