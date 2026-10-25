import { describe, expect, it } from "vitest";
import {
  asyncThrow,
  fetchParallel,
  fetchSequential,
  mapWithLimit,
  resetBalance,
  settleDemo,
  traceOrder,
  waitAborted,
  withdraw,
} from "../src/async-event-loop.ts";

describe("事件循环", () => {
  it("同步 → 微任务 → 宏任务", async () => {
    const log: string[] = [];
    traceOrder(log);
    expect(log).toEqual(["sync:start", "sync:end"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(log.filter((entry) => entry.startsWith("microtask"))).toEqual([
      "microtask:queue",
      "microtask:then1",
      "microtask:then2a",
      "microtask:then2b",
    ]);
    expect(log.at(-1)).toBe("macrotask:timeout0");
  });

  it("串行 40ms，并行 20ms", async () => {
    const delays = [20, 20];
    const started = performance.now();
    await fetchSequential(delays);
    const sequentialMs = performance.now() - started;
    const restarted = performance.now();
    await fetchParallel(delays);
    const parallelMs = performance.now() - restarted;
    expect(sequentialMs).toBeGreaterThanOrEqual(35);
    expect(parallelMs).toBeLessThan(sequentialMs / 2 + 10);
  });

  it("mapWithLimit 保序且限流", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("allSettled 不会因为一个失败全崩", async () => {
    const demo = await settleDemo();
    expect(demo["settled"]).toEqual(["ok", "boom"]);
    expect(demo["first"]).toBe(5);
  });

  it("AbortSignal 取消等待", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    await expect(waitAborted(1000, controller.signal)).rejects.toThrow("aborted");
    const fresh = new AbortController();
    fresh.abort();
    await expect(waitAborted(1, fresh.signal)).rejects.toThrow("aborted");
    await expect(waitAborted(1)).resolves.toBe("done");
  });

  it("await 之后世界可能已经变了", async () => {
    resetBalance(100);
    const both = await Promise.all([withdraw(60), withdraw(60)]);
    // 两个请求都通过了 amount > sharedBalance 检查，余额变成负数：
    // 业务约束不能靠进程内变量，必须落到数据库事务 + 乐观锁（见 shop-api）
    expect(both).toEqual([40, -20]);
  });

  it("async 函数的 throw 变成 rejected", async () => {
    await expect(asyncThrow()).rejects.toThrow(/只能用 await/);
  });
});
