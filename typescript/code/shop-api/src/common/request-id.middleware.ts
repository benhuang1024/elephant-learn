import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * X-Request-Id 中间件 —— 对应 Java 的 RequestIdFilter（OncePerRequestFilter，最高优先级）
 *
 * 三条规则照抄 Java 版：
 * 1. 进来有 X-Request-Id 且非空白 → 原样复用（网关/前端生成的 id 要能贯穿）；
 * 2. 否则生成 UUID，并**在业务处理之前**写回响应头，这样 4xx/5xx 也一定带着它；
 * 3. 挂到 request 上，供日志和异常过滤器使用。
 *
 * 与 PHP 的差异：Laravel/Symfony 的请求 id 通常靠 Monolog Processor 注入；
 * Node 里进程常驻，**绝不能把请求级状态存进模块级变量**（会串到别的请求上），
 * 必须挂在 request 对象上 —— 这是 share-nothing 直觉失效的第一个地方（docs/03）。
 *
 * 类型说明：这里用「自己的接口类型 RequestWithId」而不是 declare module  augmentation，
 * 因为 express 的类型入口在 ESM 里做全局增强不稳定（踩过）；需要读 id 的地方就断言一次。
 */

export const REQUEST_ID_HEADER = "X-Request-Id";

export interface RequestWithId extends Request {
  requestId?: string;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = candidate && candidate.trim().length > 0 ? candidate : randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
