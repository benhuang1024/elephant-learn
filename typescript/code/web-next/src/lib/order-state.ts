/**
 * Server Action 的表单状态契约
 *
 * 为什么单独一个文件：`"use server"` 模块**只能导出 async 函数**。
 * 把 `initialOrderFormState` 这种普通对象放在 actions.ts 里，客户端组件 import 到的不是对象本身，
 * 而是一个「服务器引用代理」—— 表现就是 `Object.keys(state.fieldErrors)` 直接抛
 * "Cannot convert undefined or null to object"。契约类型必须待在没有指令的模块里（docs/13）。
 */

export interface OrderFormState {
  ok: boolean;
  message: string;
  fieldErrors: Record<string, string>;
  orderId: number | null;
}

export const initialOrderFormState: OrderFormState = {
  ok: false,
  message: "",
  fieldErrors: {},
  orderId: null,
};
