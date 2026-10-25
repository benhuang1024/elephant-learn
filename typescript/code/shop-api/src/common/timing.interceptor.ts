import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { type Observable, finalize } from "rxjs";

/**
 * X-Elapsed-Ms 拦截器 —— 对应 Java 的 RequestTimingInterceptor（HandlerInterceptor）
 *
 * 只在 /api/** 生效（Java 版 addPathPatterns("/api/**")，actuator 排除在外），
 * 语义也一致：preHandle 记时、afterCompletion 写头，值是非负整数毫秒、无单位后缀。
 *
 * Nest 的 Interceptor ≈ Spring 的 HandlerInterceptor + AOP 的合体：
 * next.handle() 之前是 preHandle，`.pipe(finalize(...))` 是 afterCompletion
 * （成功、失败、超时都会走 finalize）。
 *
 * 一个自动对齐的细节：Nest 的执行顺序是 Middleware → **Guard** → Interceptor，
 * 所以 401/403（Guard 抛出的）请求不会带上 X-Elapsed-Ms —— 和 Java 版
 * 「Security 链在 Interceptor 之前就短路」的表现一致。
 */
@Injectable()
export class RequestTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const url = request.originalUrl ?? request.url ?? "";

    if (!url.startsWith("/api/")) return next.handle();

    const start = performance.now();
    return next.handle().pipe(
      finalize(() => {
        const elapsed = Math.max(0, Math.round(performance.now() - start));
        // headersSent 之后 setHeader 会抛错；这里只可能在写响应之前
        if (!response.headersSent) response.setHeader("X-Elapsed-Ms", String(elapsed));
      }),
    );
  }
}
