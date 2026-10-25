/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metrics } from "../auth/users.service.js";

/**
 * @Timed("ProductService.create") —— 方法装饰器版的「切面」
 *
 * Java 版是 @LogExecution + @Aspect（Spring AOP 动态代理）。
 * TS 里装饰器**不能替换方法体**（没有运行时代理），所以只能：
 *   1. 写一个方法装饰器，替换 descriptor.value（本文件的做法，等价于手写包装）；
 *   2. 或者显式 `this.timed(name, fn)` 包一层。
 *
 * 关键差异（docs/07 会展开）：Java 的切面只在「经过代理的调用」上生效，
 * 所以 `this.inner()` 自调用会让 @Transactional / @Aspect 失效；
 * 这里的装饰器是直接替换原型上的方法，**自调用照样生效** —— 少了一个经典的坑。
 */
export function Timed(name: string): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ): TypedPropertyDescriptor<any> => {
    const original = descriptor.value;
    if (typeof original !== "function") {
      throw new TypeError(`@Timed 只能装饰方法: ${String(name)}`);
    }

    descriptor.value = function wrapped(this: { metrics?: Metrics }, ...args: any[]): any {
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const elapsed = Math.round(performance.now() - start);
        this.metrics?.record(name, elapsed);
      }
    };
    return descriptor;
  };
}
