import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../db/database.js";
import { Metrics } from "../auth/users.service.js";
import { Public } from "../auth/roles.decorator.js";

/**
 * /actuator 风格的运维端点 —— 对应 Spring Boot Actuator
 *
 * Node 生态没有内置 Actuator，通常用 @nestjs/terminus（health indicators）或手写。
 * 这里手写，因为只有三个端点，且便于和 Java 版逐字段对比：
 *   GET /actuator/health  → 公开，DB 不通返回 503
 *   GET /actuator/info    → 公开，对应 application.yml 的 info.app.*
 *   GET /actuator/metrics → 需要认证（Java 版也只放开 health/info）
 *
 * 为什么 health 要用 @Res？因为状态码要随 DB 检查结果变化，
 * 而 @HttpCode 是编译期静态的 —— 这类「运行时决定状态码」在 Spring 里靠 ResponseEntity 解决，
 * Nest 的对等写法就是 passthrough 的 @Res（不接管 body，只设置头/码）。
 */
@Controller("actuator")
export class ActuatorController {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly metrics: Metrics,
  ) {}

  @Public()
  @Get("health")
  health(@Res({ passthrough: true }) response: Response) {
    let dbStatus: "UP" | "DOWN" = "UP";
    let error: string | undefined;
    try {
      this.database.db.get(sql`select 1`);
    } catch (cause) {
      dbStatus = "DOWN";
      error = cause instanceof Error ? cause.message : String(cause);
    }

    response.status(dbStatus === "UP" ? 200 : 503);

    const db =
      error === undefined
        ? { status: dbStatus, details: { database: "SQLite", file: this.dbFile } }
        : { status: dbStatus, details: { error } };

    return {
      status: dbStatus === "UP" ? "UP" : "DOWN",
      components: {
        db,
        memory: {
          status: "UP",
          details: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            unit: "MB",
          },
        },
        ping: { status: "UP" },
      },
    };
  }

  @Public()
  @Get("info")
  info() {
    return {
      app: {
        name: "shop-api",
        description: "TypeScript 7 + NestJS 12 示例应用",
        version: "1.0.0",
      },
      runtime: {
        node: process.version,
        pid: process.pid,
      },
    };
  }

  /** 没写 @Public()，所以走全局 Guard：未认证 → 401（与 Java 版的 /actuator/metrics 一致） */
  @Get("metrics")
  metricsSnapshot() {
    return {
      counters: this.metrics.snapshot(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private get dbFile(): string {
    return this.config.get<string>("DB_FILE") ?? "shop.db";
  }
}
