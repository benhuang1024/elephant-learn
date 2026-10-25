import { Module } from "@nestjs/common";
import { DatabaseModule } from "../db/database.module.js";
import { OrderController } from "./order.controller.js";
import { OrderRepository } from "./order.repository.js";
import { OrderService } from "./order.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService],
})
export class OrderModule {}
