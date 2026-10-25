import { Module } from "@nestjs/common";
import { BasicAuthGuard } from "./basic-auth.guard.js";
import { UsersService } from "./users.service.js";

/**
 * AuthModule —— 对应 Java 的 SecurityConfig（但拆成了 Guard + Service + 元数据装饰器）
 *
 * 导出 BasicAuthGuard 是为了让 AppModule 把它注册成 APP_GUARD（全局守卫）。
 */
@Module({
  providers: [UsersService, BasicAuthGuard],
  exports: [UsersService, BasicAuthGuard],
})
export class AuthModule {}
