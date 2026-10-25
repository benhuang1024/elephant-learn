/**
 * 错误处理：TS 没有受检异常，也没有 multi-catch 的类型保证
 *
 * PHP: throw new InsufficientStockException(...)，Throwable 层级，finally，异常是「对象」；
 *      catch (\Exception $e) 只抓 Exception，\Error 要单独抓。
 * JS : **任何东西**都能 throw（字符串、对象、undefined），所以 catch 的参数类型是 unknown；
 *      没有受检异常，函数签名上的 `: Result` 只是约定，编译器不帮你检查是否 catch。
 *
 * 三条纪律：
 * 1. 只 throw Error 及其子类（带 name、message、stack、cause）。
 * 2. catch (e) 之后必须先收窄（is 守卫 / instanceof），再读字段。
 * 3. 「可预期的失败」用返回值（Result 类型），「程序 bug / 基础设施故障」才用 throw。
 *    —— 这条是 Rust/Go 的影响，对 PHP 人来说是把 InvalidForm 之类从异常改成返回值。
 */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type: string,
    readonly extras: Readonly<Record<string, unknown>> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class NotFoundException extends AppError {
  constructor(what: string, id: number | string) {
    super(`${what} ${id} 不存在`, 404, "about:blank", { what, id });
  }
}

export class ConflictException extends AppError {
  constructor(message: string, extras: Record<string, unknown> = {}) {
    super(message, 409, "about:blank", extras);
  }
}

export class InsufficientStockException extends ConflictException {
  constructor(
    readonly sku: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`商品 ${sku} 库存不足`, { sku, requested, available });
  }
}

/** 收窄 unknown：这是 PHP 人最容易忘的一步 —— catch 里直接 e.message 会编译失败。 */
export function caughtMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function describeThrowable(value: unknown): string {
  if (value instanceof AppError) return `${value.name}(${value.status}): ${value.message}`;
  if (value instanceof Error) return `Error: ${value.message}`;
  if (typeof value === "string") return `string thrown: ${value}`;
  return `thrown: ${JSON.stringify(value)}`;
}

/* ------------------------------------------------------------------ *
 * Result：把「可预期失败」变成值
 * ------------------------------------------------------------------ */

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** map / mapErr / andThen：≈ PHP 里手写 Result 类时的链式 API。 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** 把 try/catch 收进一个函数：这是「没有受检异常」的实用补偿手段。 */
export function tryInto<T>(fn: () => T): Result<T, AppError> {
  try {
    return ok(fn());
  } catch (cause) {
    if (cause instanceof AppError) return err(cause);
    return err(
      new AppError(
        cause instanceof Error ? cause.message : String(cause),
        500,
        "about:blank",
        {},
        { cause },
      ),
    );
  }
}

/** 演示：库存检查返回 Result，调用方被类型逼着处理失败分支。 */
export function reserve(stock: number, requested: number): Result<number, InsufficientStockException> {
  if (requested <= 0) {
    return err(new InsufficientStockException("INVALID", requested, stock));
  }
  if (requested > stock) {
    return err(new InsufficientStockException("SKU-3", requested, stock));
  }
  return ok(stock - requested);
}

/** 异常链：ES2022 的 Error cause，等价于 PHP 的 new Exception($msg, 0, $previous)。 */
export function wrapWithCause(): void {
  try {
    throw new Error("数据库连接超时");
  } catch (cause) {
    throw new AppError("下单失败", 500, "about:blank", { stage: "reserve" }, { cause });
  }
}
