/**
 * 数组 / 对象函数：把 PHP 的数组函数一一对上
 *
 * PHP 的数组函数是「外部函数 + 传数组」：array_map($fn, $xs)、array_filter($xs, $fn)。
 * JS 是「方法 + 链式」：xs.map(fn).filter(fn) —— 参数顺序不同，且回调签名是 (item, index, array)。
 *
 * 三个最容易翻车的点写在下面：sort 的默认比较、filter 的真值判断、对象没有顺序保证。
 */

export interface Row {
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
}

export const rows: readonly Row[] = [
  { sku: "SKU-1", name: "键盘", priceCents: 29900, stock: 12 },
  { sku: "SKU-2", name: "鼠标", priceCents: 9900, stock: 0 },
  { sku: "SKU-3", name: "显示器", priceCents: 199900, stock: 3 },
];

/** array_map / array_column / array_sum / count / array_unique / array_keys */
export function arrayFunctionTour(): Record<string, unknown> {
  const names = rows.map((row) => row.name); // array_column($rows, 'name')
  const prices = rows.map((row) => row.priceCents);
  const total = prices.reduce((sum, cents) => sum + cents, 0); // array_sum()
  const skus = ["SKU-1", "SKU-1", "SKU-2"];
  return {
    names,
    total,
    average: Math.round(total / rows.length), // 没有 count()，用 .length
    unique: [...new Set(skus)], // array_unique()，注意需要展开成数组
    indexes: skus.map((_, i) => i), // array_keys()
  };
}

/** array_filter 默认去掉 falsy；JS 的 filter 一样，所以「过滤 0 库存」要写清楚条件。 */
export function inStock(list: readonly Row[] = rows): Row[] {
  return list.filter((row) => row.stock > 0);
}

/** array_search / in_array：找不到时 JS 用 find 返回 undefined，比 PHP 的 false 更可组合。 */
export function findBySku(sku: string, list: readonly Row[] = rows): Row | undefined {
  return list.find((row) => row.sku === sku);
}

export const hasSku = (sku: string, list: readonly Row[] = rows): boolean =>
  list.some((row) => row.sku === sku); // in_array()

/** array_reduce 的 accumulate 形态；注意 reduce 的初始值一定要给，否则空数组会抛错。 */
export function groupByStock(list: readonly Row[] = rows): Record<string, string[]> {
  return list.reduce<Record<string, string[]>>(
    (acc, row) => {
      const bucket = row.stock > 0 ? "in" : "out";
      acc[bucket] = [...(acc[bucket] ?? []), row.sku];
      return acc;
    },
    {},
  );
}

/** ES2024 的 Object.groupBy（≈ array_reduce 分组，PHP 8.3 还没有对应函数）。返回值是 Partial，键可能不存在。 */
export function groupByNameLength(list: readonly Row[] = rows): Partial<Record<string, Row[]>> {
  return Object.groupBy(list, (row) => String(row.name.length));
}

/** usort 对照：JS 的 sort **默认按字符串比较**，数字必须给比较函数；且原地修改，先复制。 */
export function sortByPrice(list: readonly Row[], direction: "asc" | "desc" = "asc"): Row[] {
  const copy = [...list];
  copy.sort((a, b) => (direction === "asc" ? a.priceCents - b.priceCents : b.priceCents - a.priceCents));
  return copy;
}

export function naiveNumberSort(values: readonly number[]): number[] {
  return [...values].sort(); // ← 反例：[1, 10, 2] 变成 [1, 10, 2]（字典序）
}

/** PHP list()/解构；剩余参数 ≈ ...$args。 */
export function destructureDemo(): Record<string, unknown> {
  const [first, ...rest] = [1, 2, 3, 4];
  const { sku, ...others } = rows[0]!;
  return { first, rest, sku, others };
}

/** 展开不可变更新：PHP 的 spread 操作符只能用于数组，这里演示对象/数组的「改了但不原地改」。 */
export function restock(sku: string, quantity: number, list: readonly Row[] = rows): Row[] {
  return list.map((row) => (row.sku === sku ? { ...row, stock: row.stock + quantity } : row));
}

/** 对象没有元素顺序保证（虽然现代引擎按插入顺序），要排序只能转成数组。 */
export function objectIteration(): Record<string, unknown> {
  const config = { host: "127.0.0.1", port: 3306, dbname: "shop" };
  return {
    entries: Object.entries(config), // ≈ array_map with keys / foreach ($arr as $k => $v)
    keys: Object.keys(config),
    values: Object.values(config),
    has: "port" in config, // array_key_exists()
  };
}

/** 深拷贝：PHP 的 clone 是浅拷贝、$new = $old 也是浅拷贝；JS 同理，深拷贝要 structuredClone()。 */
export function shallowVsDeep(): Record<string, unknown> {
  const original: Row[] = [{ ...rows[0]! }];
  const shallow = [...original];
  const deep = structuredClone(original);
  shallow[0]!.stock = 999;
  return {
    originalStock: original[0]!.stock, // 浅拷贝只复制了外层数组，元素是同一个对象
    deepStock: deep[0]!.stock,
  };
}
