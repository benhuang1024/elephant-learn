/**
 * null / undefined：一个类型位变成两个
 *
 * PHP: 只有 null。`?string $x` 表示 string|null，`??` 提供默认值，`?:` 判 falsy。
 * JS : null（只有一个「显式的空」，typeof null === "object" 是历史 bug）
 *      undefined（「没赋值 / 没返回 / 数组越界」的默认状态）
 * TS : 两者都算独立类型；`strictNullChecks` 打开后 null/undefined 不再能塞进任何类型，
 *      这一条开关就等于 PHP 里「所有函数签名都加 ?」——**它就是 TS 最有价值的特性**。
 */

/** PHP: function find(int $id): ?Product */
export function findById(id: number, rows: readonly { id: number }[]): { id: number } | undefined {
  // Array.prototype.find 的返回类型天生带 undefined，编译器逼你处理
  return rows.find((row) => row.id === id);
}

/** 可选参数 / 可选属性 / 默认值三件套 */
export function buildQuery(
  q: string,
  { page = 1, size = 20 }: { page?: number; size?: number } = {},
): string {
  return `q=${encodeURIComponent(q)}&page=${page}&size=${size}`;
}

/**
 * ?. 可选链 ≈ PHP 的 ?->（PHP 8 还没有，通常写 `$a?->b ?? null` 或 isset 链）。
 * 注意：?. 只保证「不炸」，结果仍是 undefined，链尾通常还要 ?? 。
 */
export function cityOf(user: { profile?: { address?: { city?: string } | null } | null }): string {
  return user.profile?.address?.city ?? "未知城市";
}

/** ?? 空值合并 ≈ PHP 的 ??；?: / || 是「falsy 合并」≈ PHP 的 ?:，0 和 "" 会被吃掉。 */
export function fallbackDemo(input: { count?: number; label?: string }): Record<string, unknown> {
  return {
    withNullish: input.count ?? 10, // undefined -> 10
    withLogicalOr: input.count || 10, // 0 -> 10（bug 现场）
    emptyLabel: input.label ?? "",
  };
}

/** ??= &&= ||= 与 PHP 的 ??= 完全同名同义。 */
export function mutateDefaults(config: { retries?: number }): number {
  config.retries ??= 3;
  return config.retries;
}

/** 非空断言 `!`：告诉编译器「我保证不是 null」。等价于 PHP 里无视可空注解直接 ->，出事自己扛。 */
export function riskyFirstLine(text: string | null): string {
  if (text === null) return "";
  const matched = text.match(/^(\S+)/);
  return matched ? matched[1]! : "";
}

/**
 * 收窄：TS 对 null 的收窄很聪明，但对「回调里的重新读取」不保证，
 * 这就是为什么 PHP 人会在 setTimeout/数组回调里看到 'object is possibly undefined'。
 */
export function safeSum(values: readonly (number | null | undefined)[]): number {
  let total = 0;
  for (const value of values) {
    if (value !== null && value !== undefined) total += value;
  }
  return total;
}

/**
 * 数组越界：TS 默认不报错（noUncheckedIndexedAccess 打开后会带 undefined），
 * 我们在全仓 tsconfig 里打开了它 —— 这更接近 PHP「越界 warning + null」的现实，而不是假装安全。
 */
export function secondOrNone(names: readonly string[]): string | undefined {
  return names[1];
}
