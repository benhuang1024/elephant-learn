/**
 * 单文件脚本：Node 24 原生擦除类型运行 TS，不需要 ts-node / tsx。
 *
 *   node code/lang-basics/scripts/hello.ts
 *
 * 限制（所以只适合脚本，不适合工程）：
 * - 不能「有语义」的类型语法：enum、namespace、参数属性 constructor(private x: T) 都需要生成代码；
 * - import 必须写全扩展名（.ts / .js），因为这就是一份 ESM；
 * - 不做类型检查 —— 想检查请跑 pnpm typecheck。
 */

interface Greeting {
  name: string;
  language: string;
}

function greet(person: Greeting): string {
  return `你好, ${person.name}! 当前 Node ${process.version}，正在学 ${person.language}`;
}

const runtime = {
  node: process.version,
  platform: process.platform,
  pid: process.pid,
} satisfies Record<string, string | number>;

/** 类型擦除的现场证据：删掉类型注解后，这段代码一模一样能跑。 */
function erased(): string {
  const list = [1, 2, 3];
  return `list 的编译期类型是 number[]，运行时是 ${Object.prototype.toString.call(list)}`;
}

console.log(greet({ name: "PHPer", language: "TypeScript" }));
console.log("运行时信息:", runtime);
console.log(erased());
