import {
  Injectable,
  Logger,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthenticatedUser } from "../common/zod.pipe.js";

/**
 * 演示账号（内存用户）—— 对应 Java 的 InMemoryUserDetailsManager
 *
 * Java: 用户名 + BCrypt(password) + roles("ADMIN") → 权限名自动加前缀 ROLE_ADMIN。
 * 这里保持一致：admin/admin123 = ADMIN，customer/customer123 = CUSTOMER，
 * hasRole('ADMIN') 的等价写法是 roles.includes("ADMIN")。
 *
 * **安全说明（第 09 章会展开）**：演示项目里密码来自环境变量默认值，比对用
 * 「两边先 SHA-256 再 timingSafeEqual」——这样做只是为了**定长比较**，不是为了存储密码。
 * 真实项目必须用 argon2id / bcrypt 散列存储，见 docs/09。
 */
@Injectable()
export class UsersService {
  private readonly users: readonly AuthenticatedUser[];
  private readonly secrets = new Map<string, string>();

  constructor(config: ConfigService) {
    const adminName = config.get<string>("ADMIN_USERNAME") ?? "admin";
    const adminPass = config.get<string>("ADMIN_PASSWORD") ?? "admin123";
    const customerName = config.get<string>("CUSTOMER_USERNAME") ?? "customer";
    const customerPass = config.get<string>("CUSTOMER_PASSWORD") ?? "customer123";

    this.users = [
      { username: adminName, roles: ["ADMIN"] },
      { username: customerName, roles: ["CUSTOMER"] },
    ];
    this.secrets.set(adminName, digest(adminPass));
    this.secrets.set(customerName, digest(customerPass));
  }

  findByUsername(username: string): AuthenticatedUser | undefined {
    return this.users.find((user) => user.username === username);
  }

  /** 校验用户名 + 密码；成功返回用户，失败返回 undefined（不区分「用户不存在」，避免枚举）。 */
  verify(username: string, password: string): AuthenticatedUser | undefined {
    const user = this.findByUsername(username);
    const expected = this.secrets.get(username);
    if (!user || !expected) {
      // 仍然做一次哈希，避免通过响应时间枚举用户名
      digest(password);
      return undefined;
    }
    return constantTimeEquals(expected, digest(password)) ? user : undefined;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * 请求 id 生成器 + 执行计数：对应 Java 的 RequestIdFilter（UUID）与 ExecutionMetrics（LongAdder）。
 * 单线程常驻进程里不需要 ConcurrentHashMap / LongAdder —— 普通对象就够了，
 * 这也是「Node 没有线程竞争」最直观的一个例子。
 */
@Injectable()
export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly logger = new Logger("ExecutionTime");

  record(name: string, elapsedMs: number): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
    this.logger.log(`${name} 执行耗时 ${elapsedMs}ms`);
  }

  count(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }
}

export function newRequestId(): string {
  return randomUUID();
}

/** OnModuleInit 只在这里用于「启动自检」，实际建表/seed 在 DatabaseModule 与 DemoDataSeeder。 */
export type UsersBootstrap = OnModuleInit;
