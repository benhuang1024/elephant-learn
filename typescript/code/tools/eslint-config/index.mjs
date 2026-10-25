import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * 全 workspace 共享的 ESLint 10 扁平配置。
 *
 * 为什么这个包里锁 typescript@6：
 * typescript-eslint 8.x 依赖 TS 的 JS 编译器 API，而 TS 7（Go 原生编译器）不再提供它，
 * 加载时会直接抛 "typescript-eslint does not support TS 7.0"。
 * pnpm 的隔离布局让 typescript-eslint 解析到本包的 TS 6，
 * 而各业务包自己的 `tsc` 仍然是 TS 7 —— 两套编译器并存。
 */
export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/*.test.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
