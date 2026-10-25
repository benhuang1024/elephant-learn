import type { Config } from "drizzle-kit";

/**
 * drizzle-kit 配置 —— 对照 Flyway 的 `spring.flyway.locations` 与 artisan migrate 的连接配置
 *
 *   pnpm db:generate  → 由 src/db/schema.ts 生成 SQL 迁移文件到 ./drizzle
 *   pnpm db:push      → 直接把 schema 推到数据库（演示/本地用，生产应该用 generate + migrate）
 *
 * 注意：本仓库的运行期建表走的是 database.ts 里的 SCHEMA_SQL（`create table if not exists`），
 * 目的是让 README 的「零依赖启动」和 Java 版的 H2 内存库一样简单。
 * 真正的团队项目会二选一：要么 Flyway 式迁移文件 + 版本化，要么 drizzle-kit migrate。docs/08 讲了取舍。
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_FILE ?? "shop.db",
  },
} satisfies Config;
