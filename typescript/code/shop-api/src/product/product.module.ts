import { Module } from "@nestjs/common";
import { ProductController } from "./product.controller.js";
import { ProductService } from "./product.service.js";
import { ProductRepository } from "./product.repository.js";
import { DatabaseModule } from "../db/database.module.js";
import { DemoDataSeeder } from "./demo-data.seeder.js";

/**
 * ProductModule：Controller + Service + Repository 三层，与 Java 包结构一致。
 * Repository 也要写进 providers —— Nest 不会自动扫描类，**一切依赖都要显式注册**，
 * 这一点和 Laravel 的自动绑定、Spring 的 @Repository 组件扫描都不一样。
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ProductController],
  providers: [ProductService, ProductRepository, DemoDataSeeder],
  exports: [ProductService],
})
export class ProductModule {}
