import { Body, Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import { z } from "zod";
import type { Response } from "express";
import { PlaceOrderRequestSchema, type PlaceOrderInput } from "@shop/shared";
import { CurrentUser, ZodValidationPipe, type AuthenticatedUser } from "../common/zod.pipe.js";
import { OrderService } from "./order.service.js";

/**
 * OrderController —— 对应 Java 的 OrderController（全部需要认证）
 *
 * Java 版的规则：GET /api/orders、GET /api/orders/{id}、POST /api/orders 都要求已登录；
 * ADMIN 和 CUSTOMER 都可以下单（没有额外的角色限制）。
 * 这里靠「全局 Guard + 不写 @Public」实现默认拒绝，和 Spring 的 anyRequest().authenticated() 同构。
 */
const IdParamSchema = z.coerce.number().int().positive("必须是正数");

@Controller("api/orders")
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  list() {
    return this.orders.list();
  }

  @Get(":id")
  one(@Param("id", new ZodValidationPipe(IdParamSchema)) id: number) {
    return this.orders.get(id);
  }

  @Post()
  @HttpCode(201)
  place(
    @Body(new ZodValidationPipe(PlaceOrderRequestSchema)) input: PlaceOrderInput,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    // 演示账号与 Java 版一致；Java 版没有把下单人写进订单（只有 customerName），
    // 这里保留同样的语义，只把登录人记在日志里，避免「顺手加需求」破坏横向对比。
    const created = this.orders.place(input);
    response.location(`/api/orders/${created.id}`);
    void user;
    return created;
  }
}
