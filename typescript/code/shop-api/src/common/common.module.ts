import { Global, Module } from "@nestjs/common";
import { Metrics } from "../auth/users.service.js";

/**
 * 跨模块共享的无状态单例（对应 Java 里 ExecutionMetrics 这个 @Component）。
 *
 * @Global() 的用法要克制：一旦全局，任何模块都能悄悄依赖它。
 * Laravel/Spring 里没有「@Global Provider」这种概念，Spring 的 Bean 天生全局 ——
 * 这也是 Node 项目里「谁都能 import 一个单例」和「必须从容器拿」两种风格的折中。
 */
@Global()
@Module({
  providers: [Metrics],
  exports: [Metrics],
})
export class CommonModule {}
