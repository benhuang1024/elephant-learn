/**
 * 服务端自定义异常层级 —— 与 Java 版的 exception 类一一对应
 *
 * Java : NotFoundException / ConflictException / InsufficientStockException 都是普通 RuntimeException，
 *        由 @RestControllerAdvice 统一转成 ProblemDetail。
 * Nest : 继承 HttpException 即可被 ExceptionFilter 捕获；这里用「领域异常 + 全局过滤器」
 *        保持业务代码不依赖 HTTP 语义（Controller 层才懂 HTTP），和 Spring 的分层一致。
 */

export class DomainError extends Error {
  constructor(
    message: string,
    readonly kind: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 404 资源不存在，detail = `商品 不存在: 1` */
export class NotFoundException extends DomainError {
  constructor(
    readonly resource: string,
    readonly id: number | string,
  ) {
    super(`${resource} 不存在: ${id}`, "not-found");
  }
}

/** 409 业务冲突（如 SKU 重复），对应 Java 的 ConflictException */
export class ConflictException extends DomainError {
  constructor(message: string) {
    super(message, "conflict");
  }
}

/** 409 库存不足，detail 与附加字段由 shared 的 insufficientStockProblem() 生成 */
export class InsufficientStockException extends DomainError {
  constructor(
    readonly sku: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`库存不足 sku=${sku} 需要=${requested} 剩余=${available}`, "insufficient-stock");
  }
}

/** 409 乐观锁失败，对应 Spring 的 ObjectOptimisticLockingFailureException */
export class OptimisticLockException extends DomainError {
  constructor(entity = "数据") {
    super(`${entity} 已被其他请求修改`, "optimistic-lock");
  }
}

/** 409 唯一约束 / 外键约束，对应 DataIntegrityViolationException */
export class DataIntegrityException extends DomainError {
  constructor(override readonly cause: unknown) {
    super("数据违反唯一性或外键约束", "data-integrity");
  }
}

/** 400 业务规则不满足，对应 IllegalArgumentException */
export class BadRequestException extends DomainError {
  constructor(message: string) {
    super(message, "bad-request");
  }
}
