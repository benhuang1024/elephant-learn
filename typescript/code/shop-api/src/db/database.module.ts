import { Module } from "@nestjs/common";
import { DatabaseService } from "../db/database.js";

/**
 * DatabaseModule —— Nest 的「模块」≈ Laravel 的 ServiceProvider + Spring 的 @Configuration
 *
 * 只有一个 provider 的模块看起来很啰嗦，但它的价值是**封装与显式导出**：
 * ProductModule / OrderModule 只能拿到 DatabaseService，拿不到 better-sqlite3 的连接对象本身
 * （除非它也导出）。这与 Spring 的「一个 @Bean 全局可见」不同，Nest 默认是模块内私有。
 */
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
