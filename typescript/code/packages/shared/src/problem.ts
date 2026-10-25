import { z } from "zod";

/**
 * RFC 7807 problem+json —— 与 java/code/shop-api 的 Spring ProblemDetail 逐字段对齐
 *
 * Spring Boot 4 / Framework 7 的 ProblemDetail 用 `forStatusAndDetail()` 构造时
 * 只有 status + detail，再显式 setTitle()，并且 Jackson mixin 是 NON_EMPTY，
 * 所以 **线上响应里没有 type 和 instance 两个键**。这里保持同样的形状：
 *   { "title": ..., "status": ..., "detail": ..., 业务附加字段 }
 *
 * 对照 PHP/Laravel：默认错误是 {"message": "...", "errors": {...}}，
 * 键名不同（message vs detail），但 errors 的「字段 -> 消息」形状我们照抄 Laravel 的习惯。
 */

export const ProblemDetailSchema = z
  .object({
    title: z.string(),
    status: z.int().min(400).max(599),
    detail: z.string(),
    /** 字段路径 -> 第一条错误消息（与 Spring 的 putIfAbsent「第一条胜出」一致） */
    errors: z.record(z.string(), z.string()).optional(),
  })
  .loose();

export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

export interface InsufficientStockDetail {
  sku: string;
  requested: number;
  available: number;
}

/** detail 文案与 Java 版逐字一致：`库存不足 sku=SKU-003 需要=5 剩余=2` */
export function insufficientStockProblem(detail: InsufficientStockDetail): ProblemDetail {
  return {
    title: "库存不足",
    status: 409,
    detail: `库存不足 sku=${detail.sku} 需要=${detail.requested} 剩余=${detail.available}`,
    sku: detail.sku,
    requested: detail.requested,
    available: detail.available,
  };
}

/** 参数校验失败（Pipe 抛出 ZodError 时由全局过滤器生成）。 */
export function validationProblem(errors: Record<string, string>): ProblemDetail {
  return {
    title: "参数错误",
    status: 400,
    detail: "请求参数校验失败",
    errors,
  };
}

/** IllegalArgumentException / 业务规则不满足 → 400 非法请求。 */
export function badRequestProblem(detail: string): ProblemDetail {
  return { title: "非法请求", status: 400, detail };
}

export function notFoundProblem(detail: string): ProblemDetail {
  return { title: "资源不存在", status: 404, detail };
}

/** ConflictException：业务冲突，detail 直接用异常消息，例如 `SKU 已存在: SKU-001`。 */
export function conflictProblem(detail: string): ProblemDetail {
  return { title: "业务冲突", status: 409, detail };
}

/** @Version / Drizzle 乐观锁失败。 */
export function optimisticLockProblem(): ProblemDetail {
  return { title: "并发冲突", status: 409, detail: "数据已被其他请求修改，请重试" };
}

/** 唯一约束 / 外键约束冲突。 */
export function dataIntegrityProblem(): ProblemDetail {
  return { title: "数据冲突", status: 409, detail: "数据违反唯一性或外键约束" };
}

/** Spring Security 的 401 响应体（不是 problem+json，是 Boot 的 BasicErrorController 形状）。 */
export const BootStyleErrorSchema = z.object({
  timestamp: z.string(),
  status: z.int(),
  error: z.string(),
  path: z.string(),
});

export type BootStyleError = z.infer<typeof BootStyleErrorSchema>;
