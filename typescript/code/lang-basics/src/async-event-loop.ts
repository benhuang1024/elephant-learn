/**
 * 异步与事件循环：PHP 架构师必须重建的那块直觉
 *
 * PHP: share-nothing —— 每个请求 fork 一个新进程，脚本跑完就退出，阻塞无所谓，
 *      「并发」交给 php-fpm 的 worker 池，代码里基本不需要 async。
 * Node: 一个进程常驻，一个主线程 + 事件循环 + 线程池（I/O）。
 *      **任何同步阻塞（含 CPU 密集循环）都会卡住整个进程的所有请求。**
 *      并发靠 async/Promise，不靠多进程；内存里的模块级变量是所有请求共享的（← 大坑）。
 *
 * 心智模型只有三条：
 * 1. await 会让出「当前这段代码」，但不会让出线程；同一函数内的后续代码在微任务里继续。
 * 2. 微任务（Promise 回调）优先于宏任务（timer、I/O 回调）；两者都在当前同步代码之后。
 * 3. 没有线程竞争，但 await 前后的状态可能已经被别的请求改过（“await 之后再检查”问题）。
 */

/** 顺序 vs 并行：这是 Node 里最常见的性能错误，等价于 PHP 里串行 curl 而非 curl_multi。 */
export async function fetchSequential(delays: readonly number[]): Promise<number[]> {
  const out: number[] = [];
  for (const delay of delays) {
    out.push(await waitThenReturn(delay));
  }
  return out;
}

export async function fetchParallel(delays: readonly number[]): Promise<number[]> {
  return Promise.all(delays.map((delay) => waitThenReturn(delay)));
}

function waitThenReturn(delay: number): Promise<number> {
  return new Promise((resolve) => setTimeout(() => resolve(delay), delay));
}

/** 事件循环顺序演示：sync → 微任务 → 宏任务。 */
export function traceOrder(log: string[]): void {
  log.push("sync:start");
  queueMicrotask(() => log.push("microtask:queue"));
  setTimeout(() => log.push("macrotask:timeout0"), 0);
  Promise.resolve().then(() => log.push("microtask:then1"));
  Promise.resolve()
    .then(() => {
      log.push("microtask:then2a");
      return Promise.resolve();
    })
    .then(() => log.push("microtask:then2b"));
  log.push("sync:end");
}

/**
 * 并发上限：Node 没有 worker 池的概念，需要自己限流（≈ 但比 PHP 的 fpm.max_children 更手写）。
 * 不做限流的 Promise.all(1000 个) 会瞬间打爆下游连接池。
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: size }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

/** all / allSettled / race / any 的取舍；PHP 里没有直接对应物，接近 Guzzle pool 的 settled。 */
export async function settleDemo(): Promise<Record<string, unknown>> {
  const tasks = [Promise.resolve("ok"), Promise.reject(new Error("boom"))];
  const settled = await Promise.allSettled(tasks);
  return {
    settled: settled.map((r) => (r.status === "fulfilled" ? r.value : r.reason.message)),
    first: await Promise.race([waitThenReturn(30), waitThenReturn(5)]),
  };
}

/** AbortSignal：PHP 没有语言级取消；这里对应 Guzzle 的中断 / 请求超时。 */
export function waitAborted(ms: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve("done");
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new Error("aborted"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 「await 之后再检查」：单线程不代表没有交错。
 * 两个请求同时进入函数，各自 await 之后再扣库存，中间的世界已经变了 ——
 * 这就是为什么余额/库存的唯一真相必须在数据库里（事务 + 乐观锁），而不是在 JS 变量里。
 */
let sharedBalance = 100;

export async function withdraw(amount: number): Promise<number> {
  if (amount > sharedBalance) throw new Error("余额不足");
  await Promise.resolve(); // 这里让出控制权，另一个调用可能已经改了 sharedBalance
  sharedBalance -= amount;
  return sharedBalance;
}

export function resetBalance(value = 100): void {
  sharedBalance = value;
}

/** async 函数永远返回 Promise；throw 会变成 rejected，不是同步异常。 */
export async function asyncThrow(): Promise<never> {
  throw new Error("async 里的 throw 只能用 await/catch 抓到");
}
