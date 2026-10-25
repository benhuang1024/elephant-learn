import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  badRequestProblem,
  conflictProblem,
  dataIntegrityProblem,
  insufficientStockProblem,
  notFoundProblem,
  optimisticLockProblem,
  validationProblem,
  type ProblemDetail,
} from "@shop/shared";
import {
  BadRequestException,
  ConflictException,
  DataIntegrityException,
  DomainError,
  InsufficientStockException,
  NotFoundException,
  OptimisticLockException,
} from "./domain-errors.js";
import { ValidationFailure } from "./zod.pipe.js";

/**
 * 全局异常过滤器 —— Nest 的 @RestControllerAdvice
 *
 * 请求生命周期里它是**最后一道**：任何 Guard / Pipe / Interceptor / Controller / Service 抛出的
 * 异常都会到这里。没有它，Nest 会输出自己的默认 JSON（statusCode/message/error），
 * 那就和 Java 版的 problem+json 不一致了 —— 所以「统一错误契约」是过滤器的职责，不是 Controller 的。
 *
 * 401 / 403 是特例：Java 版由 Spring Security 在进入 DispatcherServlet 之前返回，
 * 不是 problem+json。Accept 为通配（curl 默认）时返回 {"timestamp","status","error","path"}
 * 并带 WWW-Authenticate；Accept 为 application/json 时返回空 body、不带 WWW-Authenticate。
 * 这里保持同样的分支。（注：注释里不能写「星号斜杠星号」，那会提前闭合块注释——踩过这个坑。）
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const path = request.originalUrl ?? request.url;

    if (exception instanceof ValidationFailure) {
      this.writeProblem(response, 400, validationProblem(exception.fieldErrors));
      return;
    }

    if (exception instanceof InsufficientStockException) {
      this.writeProblem(
        response,
        409,
        insufficientStockProblem({
          sku: exception.sku,
          requested: exception.requested,
          available: exception.available,
        }),
      );
      return;
    }

    if (
      exception instanceof NotFoundException ||
      exception instanceof ConflictException ||
      exception instanceof OptimisticLockException ||
      exception instanceof DataIntegrityException ||
      exception instanceof BadRequestException ||
      exception instanceof DomainError
    ) {
      this.writeProblem(response, statusOfDomainError(exception), problemOfDomainError(exception));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
        this.writeSecurityError(response, request, status, path);
        return;
      }
      const body = exception.getResponse();
      const detail =
        typeof body === "string" ? body : String((body as { message?: unknown }).message ?? "请求失败");
      this.writeProblem(response, status, {
        title: status === HttpStatus.NOT_FOUND ? "资源不存在" : "非法请求",
        status,
        detail,
      });
      return;
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`未处理异常 ${request.method} ${path}: ${message}`, stackOf(exception));
    this.writeProblem(response, 500, {
      title: "服务器内部错误",
      status: 500,
      detail: "请稍后重试或联系管理员",
    });
  }

  private writeProblem(response: Response, status: number, problem: ProblemDetail): void {
    response
      .status(status)
      .type("application/problem+json")
      .send(JSON.stringify(problem));
  }

  /** 复刻 Spring Security 的 Accept 分支行为（README 的 curl 走查依赖「Accept 为通配」那条）。 */
  private writeSecurityError(
    response: Response,
    request: Request,
    status: number,
    path: string,
  ): void {
    const accept = request.headers.accept ?? "";
    const wantsJson = accept.includes("application/json") || accept.includes("text/json");
    if (wantsJson) {
      response.status(status).end();
      return;
    }
    response.setHeader("WWW-Authenticate", 'Basic realm="Realm"');
    response.status(status).json({
      timestamp: new Date().toISOString(),
      status,
      error: status === HttpStatus.UNAUTHORIZED ? "Unauthorized" : "Forbidden",
      path,
    });
  }
}

function statusOfDomainError(error: DomainError): number {
  switch (error.kind) {
    case "not-found":
      return 404;
    case "conflict":
    case "insufficient-stock":
    case "optimistic-lock":
    case "data-integrity":
      return 409;
    case "bad-request":
      return 400;
    default:
      return 500;
  }
}

function problemOfDomainError(error: DomainError): ProblemDetail {
  if (error instanceof NotFoundException) return notFoundProblem(error.message);
  if (error instanceof OptimisticLockException) return optimisticLockProblem();
  if (error instanceof DataIntegrityException) return dataIntegrityProblem();
  if (error instanceof ConflictException) return conflictProblem(error.message);
  if (error instanceof BadRequestException) return badRequestProblem(error.message);
  return { title: "服务器内部错误", status: 500, detail: error.message };
}

function stackOf(value: unknown): string | undefined {
  return value instanceof Error ? value.stack : undefined;
}
