import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { requestIdMiddleware } from "./common/request-id.middleware.js";

/**
 * 入口 —— 对应 Spring 的 ShopApiApplication.main()
 *
 * PHP 里没有这一层（php-fpm / artisan serve 替你起了进程），所以要注意：
 * **进程是你的**，日志、优雅停机、未捕获异常都得自己接。
 *
 * 生产清单（docs/15）：
 * - 优雅停机：enableShutdownHooks() 让 SIGTERM/SIGINT 触发 onModuleDestroy（关闭 SQLite 句柄）
 * - 未捕获异常：process.on("unhandledRejection") 记日志并按策略退出
 * - 多核：Node 单进程只用一个核，用 cluster / PM2 instance_num / K8s 多副本横向扩
 *   —— 这就是与 php-fpm 的 `pm.max_children` 对应的那个「并发容量」旋钮
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // X-Request-Id 必须是第一个：守卫、拦截器、异常过滤器都要能拿到它
  app.use(requestIdMiddleware);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT") ?? 8080;

  await app.listen(port, "0.0.0.0");
  new Logger("Bootstrap").log(`shop-api 已启动：http://localhost:${port}/api/products`);
}

bootstrap().catch((error: unknown) => {
  console.error("启动失败", error);
  process.exitCode = 1;
});
