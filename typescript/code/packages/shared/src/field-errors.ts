import type { ZodError } from "zod";

/**
 * 把 ZodError 拍平成 problem+json 的 errors 字段
 *
 * 形状与 Spring 的 MethodArgumentNotValidException 处理结果一致：
 *   { "sku": "不能为空", "items[0].quantity": "必须大于或等于 1" }
 * 嵌套路径用 `a.b` + 数组下标 `[i]`（Java 侧 @Valid 级联后也是 items[0].quantity），
 * 同一字段出现多条问题时**保留第一条**（Java 侧用 putIfAbsent）。
 */

export function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else {
      // symbol / 其它键一律字符串化，保证 errors 的键永远是 string
      const text = String(segment);
      out += out === "" ? text : `.${text}`;
    }
  }
  return out;
}

export function toFieldErrors(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = formatPath(issue.path);
    // 表单级问题（path 为空）用 "_" 作键，避免出现 "" 这种没法在前端定位的键
    const field = key === "" ? "_" : key;
    if (!(field in result)) result[field] = issue.message;
  }
  return result;
}
