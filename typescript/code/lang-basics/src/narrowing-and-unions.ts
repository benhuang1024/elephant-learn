/**
 * 联合类型与收窄 —— PHP 8 的 union type（string|int）在 TS 里是起点，
 * 真正的价值在于「收窄之后每个分支都能安全使用」。
 *
 * 可辨识联合（discriminated union）≈ Java 21 的 sealed interface + pattern matching，
 * 也≈ PHP 里「用一个 type 字段做标记 + match($dto->type)」的手写版，但 TS 能编译期穷尽检查。
 */

export type Numeric = string | number;

export function stringifyLoose(value: Numeric): string {
  // typeof 收窄：PHP 里等价的是 is_string()/is_int()
  return typeof value === "number" ? value.toFixed(2) : value;
}

/** 用真相等判别 null/undefined：`typeof x === "object"` 对 null 也是 true，这是 JS 的历史包袱。 */
export function head<T>(items: readonly T[] | null | undefined): T | undefined {
  // eslint-disable-next-line eqeqeq -- 故意用 == null 一次覆盖 null 和 undefined，这是 JS 的惯用法
  if (items == null) return undefined;
  return items[0];
}

/** in 运算符收窄：判断对象是否有某个键。 */
export function describeSource(x: { url: string } | { filePath: string }): string {
  if ("url" in x) return `网络资源 ${x.url}`;
  return `本地文件 ${x.filePath}`;
}

/* ------------------------------------------------------------------ *
 * 可辨识联合：状态机
 * ------------------------------------------------------------------ */

export type OrderEvent =
  | { kind: "placed"; customer: string }
  | { kind: "paid"; amountCents: number }
  | { kind: "shipped"; trackingNo: string }
  | { kind: "cancelled"; reason: string };

export type OrderState = "NEW" | "PAID" | "SHIPPED" | "CANCELLED";

/**
 * switch + never 兜底 = 编译期穷尽检查。
 * 新增一个 kind 而忘记处理时，`event.kind` 那一行会直接编译失败 ——
 * 这是 sealed interface 给 Java 人带来的安全感，在 TS 里靠 never 实现。
 */
export function next(state: OrderState, event: OrderEvent): OrderState {
  switch (event.kind) {
    case "placed":
      return "NEW";
    case "paid":
      return state === "NEW" ? "PAID" : fail(state, event);
    case "shipped":
      return state === "PAID" ? "SHIPPED" : fail(state, event);
    case "cancelled":
      return state === "SHIPPED" ? fail(state, event) : "CANCELLED";
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function fail(state: OrderState, event: OrderEvent): never {
  throw new Error(`非法状态迁移 ${state} + ${event.kind}`);
}

/* ------------------------------------------------------------------ *
 * 自定义类型守卫 / 断言函数
 * ------------------------------------------------------------------ */

export interface ApiError {
  message: string;
  status: number;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as ApiError).message === "string" &&
    "status" in value &&
    typeof (value as ApiError).status === "number"
  );
}

/** asserts 函数：调用后 TS 会收窄类型，≈ PHP 的 assert() / 提前 throw。 */
export function assertDefined<T>(value: T | undefined | null, what: string): asserts value {
  if (value === undefined || value === null) {
    throw new Error(`${what} 不存在`);
  }
}

/** satisfies：只校验形状、不拓宽类型（比 `:` 注解更适合配置对象，见 02 章）。 */
export const stockRules = {
  low: { min: 0, max: 10 },
  normal: { min: 11, max: 1000 },
} satisfies Record<string, { min: number; max: number }>;
