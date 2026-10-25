import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module.js";
import { BasicAuthGuard } from "./auth/basic-auth.guard.js";
import { CommonModule } from "./common/common.module.js";
import { ProblemDetailsFilter } from "./common/problem.filter.js";
import { RequestTimingInterceptor } from "./common/timing.interceptor.js";
import { DatabaseModule } from "./db/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { OrderModule } from "./order/order.module.js";
import { ProductModule } from "./product/product.module.js";
import { validateEnv } from "./config/env.js";

/**
 * AppModule —— 组合根（composition root）
 *
 * 对照 Spring Boot：`@SpringBootApplication + @ComponentScan` 是「扫包自动注册」；
 * Nest 是「显式列出 imports / providers / controllers」，更像 Laravel 在 config/app.php
 * 注册 ServiceProvider，或 bootstrap/app.php 里显式 use()。
 *
 * APP_GUARD / APP_INTERCEPTOR / APP_FILTER 是「全局绑定的 provider token」，
 * 执行顺序由 Nest 固定：
 *   Middleware → Guard → Interceptor(前) → Pipe → Controller → Service → Interceptor(后) → Filter
 * 对照 Java：Middleware ≈ Filter，Guard ≈ Security 的 AuthorizationFilter/表达式，
 * Interceptor ≈ HandlerInterceptor + AOP，Pipe ≈ @Valid + ArgumentResolver，Filter ≈ @RestControllerAdvice。
 *
 * 注意 request-id 中间件是在 main.ts 里用 app.use() 注册的（Express 层），
 * 因为它是一个普通函数；Nest 的 NestMiddleware 类形式更适合需要 DI 依赖的场景（docs/07 会对比）。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
    }),
    CommonModule,
    DatabaseModule,
    AuthModule,
    ProductModule,
    OrderModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: BasicAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestTimingInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
