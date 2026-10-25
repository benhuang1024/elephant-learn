import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parseDecimal, type DecimalAmount } from "@shop/shared";
import { ProductRepository } from "./product.repository.js";

/**
 * 演示数据 —— 对应 Java 的 DemoDataSeeder（ApplicationRunner + @ConditionalOnProperty）
 *
 * | Java                                        | Nest                                                |
 * |---------------------------------------------|-----------------------------------------------------|
 * | ApplicationRunner.run()                     | OnApplicationBootstrap.onApplicationBootstrap()      |
 * | @ConditionalOnProperty(matchIfMissing=true) | 在回调里判断 config.get("SHOP_SEED_DEMO_DATA")       |
 * | products.count() > 0 就跳过                 | 同样先 count()，插入按 SKU 幂等                     |
 *
 * 生命周期钩子顺序（docs/06）：
 *   onModuleInit → onApplicationBootstrap → 开始监听端口 → (请求) → onApplicationShutdown → onModuleDestroy
 */
@Injectable()
export class DemoDataSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoDataSeeder.name);

  constructor(
    private readonly products: ProductRepository,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<boolean>("SHOP_SEED_DEMO_DATA") !== true) {
      this.logger.log("SHOP_SEED_DEMO_DATA=false，跳过演示数据");
      return;
    }
    if (this.products.count() > 0) return;

    // 与 java/code/shop-api 完全一致的三件商品：README 的 curl 走查依赖 id 3 = 库存 2
    const demo = [
      { sku: "SKU-001", name: "机械键盘", price: "599.00", stock: 20 },
      { sku: "SKU-002", name: "人体工学椅", price: "1299.00", stock: 5 },
      { sku: "SKU-003", name: "限量版鼠标", price: "399.00", stock: 2 },
    ].map((row) => ({
      ...row,
      // 字面量在这里是安全的，但品牌类型仍然要求「经过解析函数才能成为金额」——
      // 这正是 branded type 的目的：连自己写代码的人都要走同一条入口。
      price: parseDecimal(row.price) as DecimalAmount,
    }));
    this.products.seed(demo);
    this.logger.log(`已插入 ${demo.length} 件演示商品`);
  }
}
