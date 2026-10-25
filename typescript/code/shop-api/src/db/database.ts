import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

/**
 * 数据库连接 —— 容器持有的「长生命周期重资源」，等价于 Spring 的 DataSource Bean
 *
 * PHP: Laravel 的 DB facade，请求结束连接归还；进程即死，没什么「共享可变状态」的担忧。
 * Nest: 一个进程一个连接对象，**所有请求共享**。所以：
 *   - 连接对象本身可以安全持有（它是线程安全的：主线程串行使用）
 *   - 但「请求级状态」绝对不能放在这个类的字段上（见 docs/03 的 share-nothing 对照）
 *
 * better-sqlite3 是**同步**驱动：查询期间事件循环是停的。
 * SQLite 只适合演示/嵌入式；生产换 `pg` + Drizzle 的异步驱动，见 docs/08「同步驱动的代价」。
 *
 * 注意这里用的是「类作为 provider token」：constructor(private config: ConfigService) 就够了，
 * 不需要像 Angular/Spring 那样写字符串 id —— 这是 Nest DI 与 PHP 容器最直观的差异。
 */

export type ShopDatabase = BetterSQLite3Database<typeof schema>;

/** 建表 DDL：与 java 的 Flyway V1__init.sql 一一对应（SQLite 用 TEXT 表达 DECIMAL/LocalDateTime）。 */
export const SCHEMA_SQL = `
create table if not exists products (
  id      integer primary key autoincrement,
  sku     text    not null unique,
  name    text    not null,
  price   text    not null,
  stock   integer not null,
  version integer not null default 0
);
create index if not exists idx_products_name on products (name);

create table if not exists orders (
  id            integer primary key autoincrement,
  customer_name text    not null,
  status        text    not null,
  total         text    not null,
  created_at    text    not null,
  version       integer not null default 0
);

create table if not exists order_items (
  id         integer primary key autoincrement,
  order_id   integer not null references orders (id) on delete cascade,
  product_id integer not null references products (id),
  sku        text    not null,
  unit_price text    not null,
  quantity   integer not null,
  subtotal   text    not null
);
create index if not exists idx_order_items_order on order_items (order_id);
create index if not exists idx_order_items_product on order_items (product_id);
`;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: ShopDatabase;
  private readonly connection: Database.Database;

  constructor(config: ConfigService) {
    const { db, raw } = createDatabase(config.get<string>("DB_FILE") ?? "shop.db");
    this.db = db;
    this.connection = raw;
  }

  /** 优雅停机时释放文件句柄（Spring 的 @PreDestroy / Laravel 的 destructor）。 */
  onModuleDestroy(): void {
    this.connection.close();
  }
}

/** 独立于 Nest 的工厂：测试里直接造一个内存库，不需要启动容器。 */
export function createDatabase(file: string): { db: ShopDatabase; raw: Database.Database } {
  const raw = new Database(file === ":memory:" ? undefined : file);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.exec(SCHEMA_SQL);
  return { db: drizzle(raw, { schema }), raw };
}

/** SQLite 的约束错误判断：驱动把错误码挂在 err.code 上。 */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? "";
  return code.includes("SQLITE_CONSTRAINT_UNIQUE") || code.includes("SQLITE_CONSTRAINT_PRIMARYKEY");
}

export function isForeignKeyViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? "";
  return code.includes("SQLITE_CONSTRAINT_FOREIGNKEY");
}
