import { SetMetadata } from "@nestjs/common";

/**
 * 声明式权限元数据 —— 对应 Spring Security 的 permitAll / @PreAuthorize("hasRole('ADMIN')")
 *
 * Java 版把规则写在 SecurityConfig 的 matcher 链里（URL → 权限），
 * Nest 的惯用法是把权限写在**路由旁边**（装饰器 + 全局 Guard）。
 * 两种风格都能表达同一套规则，区别是「规则离入口近还是离代码近」—— docs/09 会对比。
 */

export const ROLES_KEY = "shop:roles";
export const PUBLIC_KEY = "shop:public";

/** @Roles("ADMIN") ≈ @PreAuthorize("hasRole('ADMIN')") */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** @Public() ≈ .requestMatchers(GET, "/api/products/**").permitAll() */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);
