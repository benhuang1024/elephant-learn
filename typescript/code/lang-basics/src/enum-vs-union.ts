/**
 * enum vs 字面量联合 —— TS 社区的主流答案是「不要用 enum」
 *
 * PHP 8.1: enum OrderStatus: string { case New = 'new'; ... } —— 是真正的类，能实现接口、有方法、
 *          运行时是对象，`(OrderStatus::New)->value`，`OrderStatus::from('new')` 会抛错。
 * TS enum: 编译成一份双向映射的对象（运行时值可被 int 反查），`const enum` 会被内联。
 *          问题：与 isolatedModules / verbatimModuleSyntax / Node 原生类型擦除都不兼容，
 *          而且数字 enum 允许把任意 number 塞进去，安全性远低于看起来的样子。
 *
 * 推荐写法：`as const` 对象 + 字面量联合类型 + 独立函数（≈ PHP enum 的方法用自由函数代替）。
 * 本仓库全用这种写法，Zod 的 z.enum() 也只认字符串字面量数组。
 */

/** 联合字面量：值域 = 类型 = 运行时可校验的白名单，三者一次搞定。 */
export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled" | "refunded";

export const ORDER_STATUSES = ["pending", "paid", "shipped", "cancelled", "refunded"] as const;

/** 从 union 反推数组：`(typeof x)[number]` 是 TS 的「取联合成员」写法。 */
export type FromList = (typeof ORDER_STATUSES)[number];

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "待支付",
  paid: "已支付",
  shipped: "已发货",
  cancelled: "已取消",
  refunded: "已退款",
};

export function labelOf(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status]; // Record<Key, V> 保证不会漏一个 key，漏了编译报错
}

/**
 * 状态机：PHP 里通常写 enum 的 canTransitionTo()；这里用「映射表 + 可辨识联合」，
 * 表本身被 satisfies 约束，写错 key 立刻报错。
 */
const TRANSITIONS = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "refunded"],
  shipped: ["refunded"],
  cancelled: [],
  refunded: [],
} satisfies Record<OrderStatus, readonly OrderStatus[]>;

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  // satisfies 保留了每个键的字面量数组类型，includes 需要显式放宽成 readonly OrderStatus[]
  return (TRANSITIONS[from] as readonly OrderStatus[]).includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`不允许的状态迁移: ${from} -> ${to}`);
  }
}

/** 运行时把外部字符串变成受控值：TS 类型不管运行时，必须自己写守卫（或用 Zod，见 shared 包）。 */
export function parseStatus(raw: string): OrderStatus {
  const guard = (ORDER_STATUSES as readonly string[]).includes(raw);
  if (!guard) throw new Error(`未知订单状态: ${raw}`);
  return raw as OrderStatus; // 上一行的守卫保证这个断言安全
}

/* ------------------------------------------------------------------ *
 * 反面对照：真正的 TS enum 长什么样，以及它的坑
 * ------------------------------------------------------------------ */

export enum LegacyCode {
  Ok = 0,
  NotFound = 404,
  Busy = 503,
}

/** enum 是「值 + 类型」两件事一起声明，所以可以出现在默认值和对象键里。 */
export function describeLegacy(code: LegacyCode): string {
  switch (code) {
    case LegacyCode.Ok:
      return "ok";
    case LegacyCode.NotFound:
      return "not found";
    case LegacyCode.Busy:
      return "busy";
  }
}

/** 数字 enum 的漏洞：编译期允许把任意 number 断言进去，运行时也没有校验。 */
export function legacyHole(): LegacyCode {
  return 999 as LegacyCode;
}
