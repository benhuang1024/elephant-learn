/**
 * 泛型：比 PHP 简单，也比 Java 简单
 *
 * PHP 泛型只存在于 PHPDoc（@template T），运行时没有任何东西。
 * Java 泛型有类型擦除 + 通配符 `? extends T`。
 * TS 泛型也是擦除的，但推断能力极强，多数时候不需要手写实参。
 *
 * 记住三件事：
 * 1. `T` 只是编译期变量，函数体内拿不到 `T` 的运行时信息（想拿就再传一个参数或用 class 构造器）。
 * 2. 约束用 `extends`，它是「形状上必须满足」而不是「继承自」。
 * 3. 默认类型参数写在 `=` 右边，≈ PHP 的泛型默认值 / TS 的 `= never` 兜底。
 */

/** 最基础：泛型函数。等价于 PHP 的 array_map，但保留了元素类型。 */
export function identity<T>(value: T): T {
  return value;
}

/** 约束：T 必须有 id 属性。`<T extends { id: K }>` 是 ORM 仓储的常见形状。 */
export interface Entity<ID> {
  id: ID;
}

export function collectIds<T extends Entity<string>>(rows: readonly T[]): string[] {
  return rows.map((row) => row.id);
}

/** 泛型约束 + keyof：安全地取属性，等价于 PHP 的 array_pluck() 但编译期就校验字段名。 */
export function pluck<T, K extends keyof T>(rows: readonly T[], key: K): T[K][] {
  return rows.map((row) => row[key]);
}

/**
 * 泛型接口/类：TS 的 class 泛型 ≈ PHP 的 `@template` DocBlock + Collection<T>。
 * 由于是擦除的，Collection 里不能 new T()，必须把构造器当参数传进来。
 */
export class Collection<T> {
  constructor(private readonly items: readonly T[]) {}

  static from<T>(items: Iterable<T>): Collection<T> {
    return new Collection([...items]);
  }

  get size(): number {
    return this.items.length;
  }

  map<U>(fn: (item: T, index: number) => U): Collection<U> {
    return new Collection(this.items.map(fn));
  }

  filter(pred: (item: T) => boolean): Collection<T> {
    return new Collection(this.items.filter(pred));
  }

  toArray(): T[] {
    return [...this.items];
  }

  reduce<U>(fn: (acc: U, item: T) => U, seed: U): U {
    return this.items.reduce(fn, seed);
  }
}

/** 多返回类型参数 + 推断：不写实参也能推断出元组。 */
export function pair<A, B>(a: A, b: B): [A, B] {
  return [a, b];
}

/**
 * const 类型参数（TS 5.x 起）：保留字面量类型和 readonly，
 * 用在「传入一个配置对象，返回精确类型」的场景，≈ PHP 里靠数组 shape 文档做不到的事。
 */
export function defineConfig<const T extends Record<string, unknown>>(config: T): T {
  return config;
}

/** 泛型默认值 + 可空约束：把「未知」显式化，比 PHP 里靠 ?? 兜底更安全。 */
export function first<T>(items: readonly T[], fallback: T): T {
  return items.length > 0 ? items[0]! : fallback;
}

/**
 * 运行时擦除的证据：泛型函数无法回答「T 是什么」。
 * 需要按类型分派时，用显式的判别字段（见 narrowing-and-unions.ts）或传 class。
 */
export function erasedHint<T>(value: T): string {
  return `typeof value = ${typeof value}（泛型 T 在运行时不存在）`;
}
