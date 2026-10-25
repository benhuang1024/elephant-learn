import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ProductQuery } from "@shop/shared";
import { Metrics } from "../auth/users.service.js";
import { ProductRepository, toProductWire } from "./product.repository.js";
import { Timed } from "../common/timed.decorator.js";
import type { CreateProductInput, UpdateProductInput } from "@shop/shared";

/**
 * ProductService —— 应用层，对应 Java 的 ProductService（@Service + @Transactional）
 *
 * 注意这里**没有** @Transactional：Nest 没有声明式事务，事务由 Repository/Service
 * 里显式的 `db.transaction(...)` 控制（见 OrderService）。
 * 少了一个「魔法」，也少了一整类「为什么我的事务没生效」的排查（Java 的自调用坑）。
 */
@Injectable()
export class ProductService {
  constructor(
    private readonly products: ProductRepository,
    private readonly config: ConfigService,
    readonly metrics: Metrics,
  ) {}

  get currency(): string {
    return this.config.get<string>("SHOP_CURRENCY") ?? "CNY";
  }

  search(query: ProductQuery): ReturnType<typeof toProductWire>[] {
    return this.products.search(query).map(toProductWire);
  }

  get(id: number): ReturnType<typeof toProductWire> {
    return toProductWire(this.products.findById(id));
  }

  @Timed("ProductService.create")
  create(input: CreateProductInput): ReturnType<typeof toProductWire> {
    return toProductWire(this.products.create(input));
  }

  update(id: number, input: UpdateProductInput): ReturnType<typeof toProductWire> {
    const current = this.products.findById(id);
    return toProductWire(this.products.update(input, id, current.version));
  }

  remove(id: number): void {
    this.products.delete(id);
  }

  /** 报表：手写 SQL 的逃生舱（对应 Java 的 CatalogReportDao + JdbcClient，没有 HTTP 入口）。 */
  topProducts(limit: number): { sku: string; name: string; unitsSold: number }[] {
    return this.products.rawTopProducts(limit);
  }
}
