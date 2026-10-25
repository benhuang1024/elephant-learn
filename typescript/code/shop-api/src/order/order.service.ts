import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PlaceOrderInput } from "@shop/shared";
import { Metrics } from "../auth/users.service.js";
import { BadRequestException } from "../common/domain-errors.js";
import { Timed } from "../common/timed.decorator.js";
import { OrderRepository, type OrderWire } from "./order.repository.js";

/**
 * OrderService —— 对应 Java 的 OrderService（@Transactional + @LogExecution）
 *
 * 业务规则（单笔订单最多 N 行）放在应用层，HTTP 层只管形状；
 * 这条规则在 Java 里其实是「死代码」，因为 @Size(max=20) 先拦下了 ——
 * 只有把 shop.max-order-items 调到小于 20 才会走到这里。这个「双保险」我们原样保留，
 * 并在 docs/07 里当作校验层次的例子讲。
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly config: ConfigService,
    readonly metrics: Metrics,
  ) {}

  @Timed("OrderService.place")
  place(input: PlaceOrderInput): OrderWire {
    const maxItems = this.config.get<number>("SHOP_MAX_ORDER_ITEMS") ?? 20;
    if (input.items.length > maxItems) {
      throw new BadRequestException(`单笔订单最多 ${maxItems} 个商品行`);
    }
    return this.orders.place(input);
  }

  get(id: number): OrderWire {
    return this.orders.findById(id);
  }

  list(): OrderWire[] {
    return this.orders.list();
  }
}
