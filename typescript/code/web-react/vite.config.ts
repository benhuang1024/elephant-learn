import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite 配置 —— 对应 Laravel Mix / Vite 的那份 vite.config.js
 *
 * dev proxy 是关键：shop-api 与 Java 版一样**没有开 CORS**，
 * 所以浏览器要么走同源代理（这里），要么后端开 CORS（docs/10 会讲为什么演示项目不开）。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.SHOP_API_URL ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
