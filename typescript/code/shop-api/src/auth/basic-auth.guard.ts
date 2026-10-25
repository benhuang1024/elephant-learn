import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PUBLIC_KEY, ROLES_KEY } from "./roles.decorator.js";
import { UsersService } from "./users.service.js";
import type { AuthenticatedUser } from "../common/zod.pipe.js";

/**
 * HTTP Basic Guard —— 对应 Spring Security 的 BasicAuthenticationFilter + AuthorizeHttpRequests
 *
 * Java 版规则（照抄）：
 *   GET /api/products/**                 → permitAll
 *   /actuator/health, /actuator/info     → permitAll
 *   其余（POST/PUT/DELETE products、所有 orders、/actuator/metrics）→ 必须认证
 *   DELETE /api/products/{id}            → 额外要求 ROLE_ADMIN
 *
 * 差异：Spring 是「过滤器链 + 表达式」，Nest 是「一个全局 Guard + 路由元数据」。
 * Guard 在 Interceptor 之前执行，所以认证失败的响应不会带 X-Elapsed-Ms（与 Java 表现一致）。
 */
@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const credentials = this.decode(request.headers.authorization);
    if (!credentials) throw new UnauthorizedException("需要 HTTP Basic 认证");

    const user = this.users.verify(credentials.username, credentials.password);
    if (!user) throw new UnauthorizedException("用户名或密码错误");

    request.user = user;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException("权限不足");
    }
    return true;
  }

  /** Authorization: Basic base64(user:pass) —— 注意 base64 不是加密，只是编码。 */
  private decode(header: string | undefined): { username: string; password: string } | null {
    if (!header) return null;
    const [scheme, encoded] = header.split(" ");
    if (!encoded || scheme?.toLowerCase() !== "basic") return null;
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  }
}
