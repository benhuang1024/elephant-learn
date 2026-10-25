import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * 根布局（Root Layout）—— 每个路由的 HTML 外壳
 *
 * 对照 Blade：layout.blade.php 的 @yield('content')；
 * 差别是 Next 的 layout 是**组件**，可以 async、可以查数据库、可以是 RSC。
 * 这里必须导出 metadata（而不是写 <title>），因为 Next 的头信息是渲染期决定的。
 */
export const metadata: Metadata = {
  title: "shop · Next.js App Router",
  description: "SSR 商品列表 + Server Action 下单",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
