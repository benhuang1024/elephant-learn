import { z } from "zod";

/**
 * 环境变量 = 第二类外部输入（第一章就强调「类型会被擦除」，配置同理）
 *
 * PHP/Laravel: 用 dotenv + `env('DB_URL')` + Config 仓库，写错键名要到运行时才炸。
 * Spring: @ConfigurationProperties + @Validated，启动时绑定并校验。
 * Nest: @nestjs/config 加载 .env，再用一个 Zod schema 在**启动时**把环境变量收敛成强类型对象。
 *
 * 结论：三种做法的「形状」一模一样 —— 区别只是 TS 的校验是显式 schema。
 */

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  /** SQLite 文件位置；`:memory:` 走内存库（测试用） */
  DB_FILE: z.string().default("shop.db"),
  /** 演示账号：与 java/code/shop-api 的 SecurityConfig 保持一致 */
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("admin123"),
  CUSTOMER_USERNAME: z.string().default("customer"),
  CUSTOMER_PASSWORD: z.string().default("customer123"),
  /** 对应 Spring 的 shop.currency / shop.max-order-items / shop.seed-demo-data */
  SHOP_CURRENCY: z.string().length(3).default("CNY"),
  SHOP_MAX_ORDER_ITEMS: z.coerce.number().int().min(1).max(100).default(20),
  SHOP_SEED_DEMO_DATA: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

/** ConfigModule 的 validate 回调：不合法就让进程启动失败，而不是带病运行。 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`环境变量校验失败：\n${details}\n请检查 .env 或容器注入的变量。`);
  }
  return result.data;
}
