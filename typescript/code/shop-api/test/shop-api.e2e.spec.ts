import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { requestIdMiddleware } from "../src/common/request-id.middleware.js";

/** supertest 的入参类型（Express app / http.Server 都行），借用它的签名而不是 express 的类型名 */
type SupertestTarget = Parameters<typeof request>[0];

/**
 * e2e 测试 —— 对照 Java 的 @SpringBootTest + MockMvc（这里用 supertest，等价于 Laravel 的 feature test）
 *
 * 与 Java 版 README 的 curl 走查**一一对应**，这样两份代码可以横向验证：
 *   GET 商品 200 / 未认证 POST 401 / customer 下单 201 + 库存递减 / 库存不足 409 problem+json / 健康检查 200
 *
 * 注意这里用内存 SQLite + 打开 seed，测试之间共享同一个 app（beforeAll 起一次），
 * 所以断言不能依赖「干净状态」，只能依赖请求顺序 —— 这是 feature test 的常见取舍。
 */

process.env.DB_FILE = ":memory:";
process.env.SHOP_SEED_DEMO_DATA = "true";
process.env.SHOP_MAX_ORDER_ITEMS = "20";

const CUSTOMER = { user: "customer", password: "customer123" };
const ADMIN = { user: "admin", password: "admin123" };

describe("shop-api e2e", () => {
  let app: INestApplication;
  let http: SupertestTarget;

  beforeAll(async () => {
    /**
     * 必须**动态 import** AppModule：`ConfigModule.forRoot({validate})` 在 app.module.ts
     * 被 import 的那一刻就对 process.env 做了快照（静态 import 会被提前执行），
     * 写在文件顶层的 DB_FILE 赋值就来不及生效 —— 表现是「测试跑通了，但用的是 ./shop.db 文件」，
     * 第二次跑因为脏数据全红。踩过一次，值得记住。
     */
    const { AppModule } = await import("../src/app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    await app.init();
    http = app.getHttpServer() as SupertestTarget;
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/products 公开返回 3 件演示商品", async () => {
    const response = await request(http).get("/api/products").expect(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).toHaveLength(3);
    expect(response.body.map((row: { sku: string }) => row.sku)).toContain("SKU-001");
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(Number(response.headers["x-elapsed-ms"])).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/products?q= 过滤，空白视为不过滤", async () => {
    const filtered = await request(http).get("/api/products").query({ q: "键盘" }).expect(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].name).toBe("机械键盘");

    const blank = await request(http).get("/api/products").query({ q: "   " }).expect(200);
    expect(blank.body).toHaveLength(3);
  });

  it("GET /api/products/{id} 不存在 → 404 problem+json", async () => {
    const response = await request(http).get("/api/products/9999").expect(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.body).toEqual({
      title: "资源不存在",
      status: 404,
      detail: "商品 不存在: 9999",
    });
  });

  it("未认证写入 → 401 + WWW-Authenticate（与 Spring Security 的行为一致）", async () => {
    const response = await request(http)
      .post("/api/products")
      .set("Accept", "*/*")
      .send({ sku: "SKU-100", name: "显示器", price: 1999.0, stock: 3 })
      .expect(401);
    expect(response.headers["www-authenticate"]).toBe('Basic realm="Realm"');
    expect(response.body).toMatchObject({ status: 401, error: "Unauthorized", path: "/api/products" });
  });

  it("Accept: application/json 时 401 是空 body 且不带 WWW-Authenticate", async () => {
    const response = await request(http)
      .post("/api/products")
      .set("Accept", "application/json")
      .send({})
      .expect(401);
    expect(response.headers["www-authenticate"]).toBeUndefined();
    expect(response.text).toBe("");
  });

  it("错误密码 → 401；admin 创建商品 → 201 + Location", async () => {
    await request(http).post("/api/products").auth("admin", "wrong").send({ sku: "X", name: "Y", price: 1 }).expect(401);

    const created = await request(http)
      .post("/api/products")
      .auth(ADMIN.user, ADMIN.password)
      .send({ sku: "SKU-100", name: "显示器", price: 1999.0, stock: 3 })
      .expect(201);
    expect(created.headers.location).toBe(`/api/products/${created.body.id}`);
    expect(created.body).toMatchObject({ sku: "SKU-100", name: "显示器", price: 1999, stock: 3, version: 0 });
  });

  it("重复 SKU → 409 业务冲突", async () => {
    const response = await request(http)
      .post("/api/products")
      .auth(ADMIN.user, ADMIN.password)
      .send({ sku: "SKU-100", name: "又一台", price: 10, stock: 1 })
      .expect(409);
    expect(response.body).toEqual({
      title: "业务冲突",
      status: 409,
      detail: "SKU 已存在: SKU-100",
    });
  });

  it("参数不合法 → 400 参数错误 + errors 字段映射", async () => {
    const response = await request(http)
      .post("/api/products")
      .auth(ADMIN.user, ADMIN.password)
      .send({ sku: "", name: "", price: -1 })
      .expect(400);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.body.title).toBe("参数错误");
    expect(response.body.detail).toBe("请求参数校验失败");
    expect(response.body.errors.sku).toBe("不能为空");
    expect(response.body.errors.price).toBeTypeOf("string");
  });

  it("DELETE 只有 ADMIN：customer 403，admin 204", async () => {
    const created = await request(http)
      .post("/api/products")
      .auth(ADMIN.user, ADMIN.password)
      .send({ sku: "SKU-DEL", name: "待删除", price: 5, stock: 1 })
      .expect(201);

    await request(http).delete(`/api/products/${created.body.id}`).auth(CUSTOMER.user, CUSTOMER.password).expect(403);
    await request(http).delete(`/api/products/${created.body.id}`).auth(ADMIN.user, ADMIN.password).expect(204);
    await request(http).delete(`/api/products/${created.body.id}`).auth(ADMIN.user, ADMIN.password).expect(404);
  });

  it("customer 下单 → 201，库存 20→18，version 0→1", async () => {
    const before = await request(http).get("/api/products/1").expect(200);
    expect(before.body.stock).toBe(20);

    const order = await request(http)
      .post("/api/orders")
      .auth(CUSTOMER.user, CUSTOMER.password)
      .send({ customerName: "ben", items: [{ productId: 1, quantity: 2 }] })
      .expect(201);

    expect(order.headers.location).toBe(`/api/orders/${order.body.id}`);
    expect(order.body).toMatchObject({
      customerName: "ben",
      status: "PENDING",
      total: 1198,
      version: 0,
      items: [{ productId: 1, sku: "SKU-001", unitPrice: 599, quantity: 2, subtotal: 1198 }],
    });

    const after = await request(http).get("/api/products/1").expect(200);
    expect(after.body.stock).toBe(18);
    expect(after.body.version).toBe(1);
  });

  it("库存不足 → 409 problem+json，带 sku/requested/available", async () => {
    const response = await request(http)
      .post("/api/orders")
      .auth(CUSTOMER.user, CUSTOMER.password)
      .send({ customerName: "ben", items: [{ productId: 3, quantity: 3 }] })
      .expect(409);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.body).toEqual({
      title: "库存不足",
      status: 409,
      detail: "库存不足 sku=SKU-003 需要=3 剩余=2",
      sku: "SKU-003",
      requested: 3,
      available: 2,
    });
  });

  it("下单参数：数量越界 / 空购物车 → 400，错误键带下标", async () => {
    const tooBig = await request(http)
      .post("/api/orders")
      .auth(CUSTOMER.user, CUSTOMER.password)
      .send({ customerName: "ben", items: [{ productId: 1, quantity: 100 }] })
      .expect(400);
    expect(tooBig.body.errors["items[0].quantity"]).toBe("必须小于或等于 99");

    const empty = await request(http)
      .post("/api/orders")
      .auth(CUSTOMER.user, CUSTOMER.password)
      .send({ customerName: "ben", items: [] })
      .expect(400);
    expect(empty.body.errors.items).toBe("不能为空");
  });

  it("订单需要认证；列表与详情可查", async () => {
    await request(http).get("/api/orders").expect(401);
    const list = await request(http).get("/api/orders").auth(CUSTOMER.user, CUSTOMER.password).expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    const detail = await request(http)
      .get(`/api/orders/${list.body[0].id}`)
      .auth(CUSTOMER.user, CUSTOMER.password)
      .expect(200);
    expect(detail.body.items).toBeInstanceOf(Array);
    await request(http).get("/api/orders/424242").auth(CUSTOMER.user, CUSTOMER.password).expect(404);
  });

  it("传入的 X-Request-Id 会被复用", async () => {
    const response = await request(http)
      .get("/api/products")
      .set("X-Request-Id", "trace-from-gateway-1")
      .expect(200);
    expect(response.headers["x-request-id"]).toBe("trace-from-gateway-1");
  });

  it("PUT 修改商品：version 每次自增（乐观锁条件写在 UPDATE 的 WHERE 里）", async () => {
    const update = await request(http)
      .put("/api/products/2")
      .auth(ADMIN.user, ADMIN.password)
      .send({ name: "人体工学椅 Pro", price: 1399, stock: 6 })
      .expect(200);
    expect(update.body).toMatchObject({ name: "人体工学椅 Pro", price: 1399, stock: 6, version: 1 });

    const second = await request(http)
      .put("/api/products/2")
      .auth(ADMIN.user, ADMIN.password)
      .send({ name: "人体工学椅 Pro Max", price: 1499, stock: 7 })
      .expect(200);
    expect(second.body.version).toBe(2);
    // 真正的「版本不匹配 → 409 并发冲突」在 src/product/product.repository.spec.ts 里测：
    // better-sqlite3 是同步驱动，两个 HTTP 请求会被事件循环串行化，
    // 在 e2e 里几乎造不出冲突窗口 —— 这本身就是 docs/08 的一个结论。
  });

  it("运维端点：health/info 公开，metrics 需要认证", async () => {
    const health = await request(http).get("/actuator/health").expect(200);
    expect(health.body.status).toBe("UP");
    expect(health.body.components.db.status).toBe("UP");
    expect(health.body.components.ping.status).toBe("UP");

    const info = await request(http).get("/actuator/info").expect(200);
    expect(info.body.app).toMatchObject({ name: "shop-api", version: "1.0.0" });

    await request(http).get("/actuator/metrics").expect(401);
    const metrics = await request(http).get("/actuator/metrics").auth(ADMIN.user, ADMIN.password).expect(200);
    expect(metrics.body.counters).toBeTypeOf("object");
    expect(metrics.body.counters["OrderService.place"]).toBeTypeOf("number");
  });

  it("未知路径 → 404（Nest 默认，被全局过滤器统一成 problem+json）", async () => {
    const response = await request(http).get("/api/nope").expect(404);
    expect(response.body.status).toBe(404);
  });
});
