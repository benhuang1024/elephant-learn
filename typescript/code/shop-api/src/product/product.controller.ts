import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import {
  CreateProductRequestSchema,
  ProductQuerySchema,
  UpdateProductRequestSchema,
  type CreateProductInput,
  type ProductQuery,
  type UpdateProductInput,
} from "@shop/shared";
import { Public, Roles } from "../auth/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod.pipe.js";
import { ProductService } from "./product.service.js";

/**
 * ProductController —— 对应 Java 的 @RestController + @RequestMapping("/api/products")
 *
 * 请求生命周期（docs/07）：
 *   Middleware(request-id) → Guard(BasicAuth) → Interceptor(timing) → **Pipe(Zod)** → Controller
 *   → Service → Repository → 返回值 → ExceptionFilter（仅在抛异常时）
 *
 * 与 Spring 的三个手感差异：
 * 1. 路径参数没有类型转换魔法：`:id` 一定是 string，要自己用 pipe 变 number（Spring 的 `long id` 自动转）。
 * 2. Location 头要手写：Spring 用 `ResponseEntity.created(uri)` 一起返回，Nest 用 @Res({passthrough:true})
 *    或返回状态码 + 手动 setHeader；这里用 passthrough，保持「返回值仍是 DTO」。
 * 3. `@HttpCode(204)` + 返回 undefined = Spring 的 `@ResponseStatus(NO_CONTENT)` + void。
 */
/** 路径参数 `:id` 永远是 string，这里显式转换 + 校验（非数字 → 400 参数错误）。 */
const IdParamSchema = z.coerce.number().int().positive("必须是正数");

@Controller("api/products")
export class ProductController {
  constructor(private readonly products: ProductService) {}

  /** GET /api/products?q=键盘 —— 公开，无分页（与 Java 版一致） */
  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(ProductQuerySchema)) query: ProductQuery) {
    return this.products.search(query);
  }

  @Public()
  @Get(":id")
  one(@Param("id", new ZodValidationPipe(IdParamSchema)) id: number) {
    return this.products.get(id);
  }

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(CreateProductRequestSchema)) input: CreateProductInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const created = this.products.create(input);
    response.location(`/api/products/${created.id}`);
    return created;
  }

  @Put(":id")
  update(
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: number,
    @Body(new ZodValidationPipe(UpdateProductRequestSchema)) input: UpdateProductInput,
  ) {
    return this.products.update(id, input);
  }

  /** 只有 ADMIN 能删（对应 @PreAuthorize("hasRole('ADMIN')")） */
  @Delete(":id")
  @HttpCode(204)
  @Roles("ADMIN")
  remove(@Param("id", new ZodValidationPipe(IdParamSchema)) id: number): void {
    this.products.remove(id);
  }
}
