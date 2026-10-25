/**
 * @shop/shared —— 一处定义，四端复用
 *
 * 服务端用它校验入参（Pipe）、构造响应；三个前端用它做类型检查和响应校验。
 * 关键约定：**类型不是契约，schema 才是**。所以这个包的出口同时给值（schema）和类型（z.infer）。
 *
 * ESM 包（`type: module`）：Nest 与 Vite/Next 通过 exports 字段吃同一份 ESM 产物。
 * 曾经故意编成 CommonJS —— 结果浏览器里的 Vite 拿不到具名导出（docs/04 §5 有现场）。
 */

export * from "./decimal.js";
export * from "./problem.js";
export * from "./product.js";
export * from "./order.js";
export * from "./time.js";
export * from "./field-errors.js";
