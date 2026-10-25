import { z } from "zod";

/**
 * 金额：TS 没有 BigDecimal，所以「字符串定点小数 + 内部整数分」
 *
 * PHP : brick/money、bcmath；MySQL NUMERIC(12,2) 经 Jackson 输出 `599.00`（保留 scale）。
 * JS  : number 是 double，`0.1 + 0.2 !== 0.3`，而且 **JSON.stringify(599.00) === "599"**
 *       —— 数字字面量根本没有「几位小数」的概念。
 * 方案 : DTO 层用品牌字符串 `"599.00"` 表示金额，运算全部走整数分，出口由 HTTP 层
 *       以「原始 JSON 数字」写回，于是 `{"price":599.00}` 可以和 Java 版逐字节对齐。
 */

declare const DECIMAL_BRAND: unique symbol;

/** 规范化后的定点小数字符串：整数部分最多 10 位，小数部分固定 2 位。 */
export type DecimalAmount = string & { readonly [DECIMAL_BRAND]: "DecimalAmount" };

const DECIMAL_RE = /^-?\d{1,10}(\.\d{1,2})?$/;

export function parseDecimal(raw: string | number): DecimalAmount | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    // 用字符串形式再校验一次，避免 0.1+0.2 的尾巴被当成合法输入
    raw = formatNumberForDecimal(raw);
  }
  const text = raw.trim();
  if (!DECIMAL_RE.test(text)) return null;
  return normalize(text);
}

function normalize(text: string): DecimalAmount {
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const padded = (fraction + "00").slice(0, 2);
  return `${negative ? "-" : ""}${whole}.${padded}` as DecimalAmount;
}

/** 数字输入只保留 2 位小数能精确表达的形式；1.005 这类来自浮点误差尾巴的值直接判非法。 */
function formatNumberForDecimal(value: number): string {
  const fixed = value.toFixed(2);
  return Math.abs(Number(fixed) - value) < 1e-9 ? fixed : String(value);
}

export function decimalToCents(amount: DecimalAmount): number {
  const negative = amount.startsWith("-");
  const [whole = "0", fraction = "00"] = amount.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function centsToDecimal(cents: number): DecimalAmount {
  if (!Number.isInteger(cents)) throw new TypeError(`cents 必须是整数: ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return normalize(`${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`);
}

export function addDecimal(a: DecimalAmount, b: DecimalAmount): DecimalAmount {
  return centsToDecimal(decimalToCents(a) + decimalToCents(b));
}

/**
 * 乘数量：整数分 × 整数 = 精确，所以不需要四舍五入。
 * Java 版用 `unitPrice.multiply(BigDecimal.valueOf(qty)).setScale(2, HALF_UP)`，结果等价。
 */
export function multiplyDecimalByInt(amount: DecimalAmount, quantity: number): DecimalAmount {
  if (!Number.isInteger(quantity)) throw new TypeError(`数量必须是整数: ${quantity}`);
  return centsToDecimal(decimalToCents(amount) * quantity);
}

export function compareDecimal(a: DecimalAmount, b: DecimalAmount): -1 | 0 | 1 {
  const left = decimalToCents(a);
  const right = decimalToCents(b);
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** 只在出口需要「分单位」计算时用；DTO 一律传定点字符串。 */
export function sumDecimal(items: readonly DecimalAmount[]): DecimalAmount {
  return centsToDecimal(items.reduce((total, item) => total + decimalToCents(item), 0));
}

/**
 * 入站 schema：接受 JSON number 或 string（`1999`、`1999.0`、"1999.00" 都合法），
 * 输出统一成 DecimalAmount；超过 2 位小数或整数位超 10 位会被拒绝，
 * 等价于 Java 的 `@Digits(integer = 10, fraction = 2)`。
 */
export const DecimalInputSchema = z
  .union([z.number(), z.string()])
  .transform((raw, ctx): DecimalAmount => {
    const parsed = parseDecimal(raw);
    if (parsed === null) {
      ctx.addIssue({
        code: "custom",
        message: "金额必须是最多两位小数的数字（整数部分最多 10 位）",
      });
      // addIssue 之后本次解析一定失败，返回值只是占位
      return "0.00" as DecimalAmount;
    }
    return parsed;
  });

/** 带下限的金额，等价于 `@DecimalMin("0.01")` + `@Digits` 的组合。 */
export const PositiveAmountSchema = DecimalInputSchema.refine(
  (amount) => decimalToCents(amount) >= 1,
  { message: "必须大于或等于 0.01" },
);

export type PositiveAmount = z.infer<typeof PositiveAmountSchema>;

/** 零金额常量，累加起点。 */
export const ZERO_AMOUNT: DecimalAmount = normalize("0");

/**
 * 出口格式化：把 "599.00" 变成 JSON number 599。
 *
 * 与 Java 版的**已知差异**：BigDecimal 带 scale，Jackson 输出 `599.00`；
 * JS 的 number 没有「几位小数」的概念，`JSON.stringify(599.00)` 一定是 `599`。
 * 语义等价（金额相同），字面不同。前端一律用本包的 schema 把它收回 DecimalAmount 字符串，
 * 所以这个差异不会泄漏到业务代码里。详见 docs/03、docs/07。
 */
export function toWireDecimal(amount: DecimalAmount): number {
  return Number(amount);
}
