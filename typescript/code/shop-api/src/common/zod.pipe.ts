import { createParamDecorator, ExecutionContext, ForbiddenException, PipeTransform } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";
import { ZodError, type ZodType } from "zod";
import { toFieldErrors } from "@shop/shared";
import { BadRequestException } from "./domain-errors.js";

/**
 * ZodValidationPipe —— Nest 的 Pipe ≈ Symfony 的 ParamConverter / Laravel 的 FormRequest::validate()
 * 请求生命周期（第 07 章）：Middleware → Guard → Interceptor → **Pipe** → Controller → Filter
 *
 * Spring 用 @Valid + Jakarta Validation，校验失败抛 MethodArgumentNotValidException；
 * 这里校验失败抛 BadRequestException 并带上「字段 -> 第一条消息」的 map，
 * 由全局 ExceptionFilter 转成 problem+json，形状与 Java 版一致。
 */
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, _meta: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new ValidationFailure(toFieldErrors(result.error as ZodError), result.error);
  }
}

/** 携带字段错误 map 的 400，供过滤器原样转成 problem+json 的 errors。 */
export class ValidationFailure extends BadRequestException {
  constructor(
    readonly fieldErrors: Record<string, string>,
    readonly zodError: ZodError,
  ) {
    super("请求参数校验失败");
    this.name = "ValidationFailure";
  }
}

/**
 * @CurrentUser() —— 参数装饰器，等价于 Spring 的 @AuthenticationPrincipal
 * 值由 BasicAuthGuard 挂在 request.user 上。
 */
export interface AuthenticatedUser {
  username: string;
  roles: readonly string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);

/** 用于「必须有登录人」的场景（下单要知道是谁）。 */
export function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw new ForbiddenException("未认证");
  return user;
}
