import type { NextConfig } from "next";

/**
 * Next 16 配置。演示项目只需要一件事：
 * serverActions.bodySizeLimit 是给「服务端动作」的表单体积上限（默认 1MB），
 * 其余保持默认 —— Next 的约定优于配置比 Laravel/Spring 都更激进。
 */
const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [],
};

export default config;
