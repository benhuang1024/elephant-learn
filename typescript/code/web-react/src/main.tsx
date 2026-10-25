import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { queryClient } from "./queryClient";
import "./styles.css";

/**
 * 入口：createRoot + 两个 Provider
 *
 * 对照 Blade/Laravel：Blade 是「服务端把 HTML 拼好」，这里只是把 root 交给 JS；
 * 真正的「数据获取 + 渲染」发生在组件树里，由 QueryClient 提供缓存上下文。
 */
const container = document.getElementById("root");
if (!container) throw new Error("#root 不存在，检查 index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
