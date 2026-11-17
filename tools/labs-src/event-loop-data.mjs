/* 事件循环实验台数据：手工标注的逐帧 trace + 构建期用真实 Node 运行校验输出顺序 */
import { spawnSync } from 'node:child_process';

function makeTrace() {
  const st = { stack: [], micro: [], macro: [], tick: [], out: [] };
  const steps = [];
  const snap = (kind, note, focus) => steps.push({
    kind, note: note || '', focus: focus || kind,
    stack: st.stack.slice(), micro: st.micro.slice(), macro: st.macro.slice(), tick: st.tick.slice(), out: st.out.slice()
  });
  return {
    steps,
    phase(name, note) { snap('phase', note, 'phase'); steps[steps.length - 1].phase = name; },
    push(name, note) { st.stack.push(name); snap('push', note, 'stack'); },
    pop(note) { st.stack.pop(); snap('pop', note, 'stack'); },
    log(text, note) { st.out.push(text); snap('log', note, 'out'); },
    mq(name, note) { st.micro.push(name); snap('mq', note, 'micro'); },
    mr(name, note) { st.micro = st.micro.filter((x) => x !== name); st.stack.push(name); snap('mr', note, 'micro'); },
    tq(name, ms, note) { st.macro.push({ name, ms }); snap('tq', note, 'macro'); },
    tr(name, note) { st.macro = st.macro.filter((x) => x.name !== name); st.stack.push(name); snap('tr', note, 'macro'); },
    nt(name, note) { st.tick.push(name); snap('nt', note, 'tick'); },
    nr(name, note) { st.tick = st.tick.filter((x) => x !== name); st.stack.push(name); snap('nr', note, 'tick'); },
    note(text) { snap('note', text, 'note'); }
  };
}

const SNIPPETS = [];
function add(meta, build) {
  const t = makeTrace();
  build(t);
  SNIPPETS.push(Object.assign({ steps: t.steps }, meta));
}

add({
  id: 'queue-jump', name: '微任务插队', level: '入门', php: 'PHP-FPM 里没有这一层：一个请求内代码顺序执行到底。最接近的是 Swoole 的 defer（请求收尾时执行）。',
  code: `log("sync:start");
queueMicrotask(() => log("microtask:queue"));
setTimeout(() => log("macrotask:timeout0"), 0);
Promise.resolve().then(() => log("microtask:then1"));
log("sync:end");`,
  teach: 'setTimeout(fn, 0) 不是「立刻」。同步代码跑完 → 清空全部微任务 → 才轮到第一个宏任务。'
}, (t) => {
  t.phase('同步阶段', '主脚本本身就是一个宏任务。同步代码一路跑完，中途不会让出。');
  t.push('主脚本');
  t.log('sync:start');
  t.mq('queueMicrotask', 'queueMicrotask 只是登记：回调进微任务队列，现在不执行。');
  t.tq('timeout0', 0, 'setTimeout(fn, 0) 登记一个宏任务。0ms 的含义是「尽快」，不是「立刻」。');
  t.mq('then1', 'Promise.resolve().then 再排一个微任务， FIFO：排在 queue 后面。');
  t.log('sync:end');
  t.pop('同步代码结束，调用栈清空。事件循环的第一件事：清空微任务队列。');
  t.phase('微任务阶段', '当前宏任务结束 → 把微任务队列一次性清空（包括期间新产生的）。');
  t.mr('queueMicrotask');
  t.log('microtask:queue');
  t.pop();
  t.mr('then1');
  t.log('microtask:then1');
  t.pop('微任务队列空了，才允许取下一个宏任务。');
  t.phase('宏任务阶段', '从宏任务队列取一个执行；执行完再回头检查微任务。');
  t.tr('timeout0');
  t.log('macrotask:timeout0');
  t.pop('本轮结束：微任务空、宏任务空 → 进程若无其他句柄就退出。');
});

add({
  id: 'await-race', name: 'await 让出点竞态', level: '核心', php: '等价于 Octane/Swoole 下把「本次请求的余额」挂在单例属性上：两个协程交错，检查与扣减之间隔着一次让出。',
  code: `let balance = 100;
async function withdraw(amount) {
  if (amount > balance) throw new Error("余额不足");
  await Promise.resolve();
  balance -= amount;
  log("balance=" + balance);
}
withdraw(60);
withdraw(60);
log("sync:end");`,
  teach: '全程单线程，没有任何线程竞争，余额仍被扣成 -20。单线程只保证「一段同步代码不被打断」，不保证「你的函数从头到尾原子」。'
}, (t) => {
  t.phase('同步阶段', '两个「请求」先后进入同一个线程。');
  t.push('主脚本');
  t.push('withdraw #1');
  t.note('检查：60 > 100？否 → 通过。注意：此刻还没扣钱。');
  t.mq('withdraw#1 续体', 'await 让出：函数剩下的部分被打包成微任务。检查做完了，扣减还没做。');
  t.pop('withdraw #1 在 await 处返回（返回一个 Promise）。');
  t.push('withdraw #2');
  t.note('检查：60 > 100？balance 仍是 100 → 也通过。这就是 check-after-await。');
  t.mq('withdraw#2 续体');
  t.pop();
  t.log('sync:end');
  t.pop();
  t.phase('微任务阶段', '两个续体按入队顺序醒来，各自扣减。');
  t.mr('withdraw#1 续体');
  t.log('balance=40', '100 - 60 = 40。');
  t.pop();
  t.mr('withdraw#2 续体');
  t.note('它醒来时 balance 已是 40，但「检查」早在让出前就做完了 → 直接扣。');
  t.log('balance=-20', '负余额。修法：await 之后再检查 + 唯一真相放数据库（事务 + 乐观锁）。');
  t.pop();
});

add({
  id: 'micro-spawn', name: '微任务里再生微任务', level: '入门', php: 'PHP 无对应概念。记住：微任务阶段是「清空为止」，不是「只跑一个」。',
  code: `log("A");
Promise.resolve().then(() => {
  log("B");
  Promise.resolve().then(() => log("C"));
});
setTimeout(() => log("D"), 0);
log("E");`,
  teach: '微任务里新产生的微任务插在本轮队列末尾，仍然早于任何宏任务。所以 C 在 D 前面。'
}, (t) => {
  t.phase('同步阶段');
  t.push('主脚本');
  t.log('A');
  t.mq('thenB');
  t.tq('timeoutD', 0);
  t.log('E');
  t.pop();
  t.phase('微任务阶段');
  t.mr('thenB');
  t.log('B');
  t.mq('thenC', '微任务里再排微任务：进本轮队列末尾，宏任务继续等。');
  t.pop();
  t.mr('thenC');
  t.log('C');
  t.pop('队列清空，才轮到宏任务。');
  t.phase('宏任务阶段');
  t.tr('timeoutD');
  t.log('D');
  t.pop();
});

add({
  id: 'async-order', name: 'async/await 的真实顺序', level: '核心', php: '把 await 读成「这一行之后改成回调」，顺序就对了。PHP 的同步直觉在这里完全失效。',
  code: `async function main() {
  log("1");
  await null;
  log("2");
}
main();
log("3");
Promise.resolve().then(() => log("4"));
log("5");`,
  teach: 'await null 也会让出！await 后面哪怕是已完成的值，续体也要排微任务。所以 2 在 5 后面。'
}, (t) => {
  t.phase('同步阶段');
  t.push('主脚本');
  t.push('main()');
  t.log('1', 'await 之前的部分是同步执行的。');
  t.mq('main 续体', 'await null：值已就绪，但续体仍要排微任务（规范如此）。');
  t.pop('main() 返回 Promise，调用栈回到主脚本。');
  t.log('3');
  t.mq('then4', '排在 main 续体后面。');
  t.log('5');
  t.pop();
  t.phase('微任务阶段');
  t.mr('main 续体');
  t.log('2');
  t.pop();
  t.mr('then4');
  t.log('4');
  t.pop();
});

add({
  id: 'macro-micro', name: '宏任务之间插微任务', level: '进阶', php: ' Node 的「公平性」规则：每执行一个宏任务之前，先把微任务队列清空。',
  code: `setTimeout(() => {
  log("T1");
  Promise.resolve().then(() => log("M-in-T1"));
}, 0);
setTimeout(() => log("T2"), 0);
Promise.resolve().then(() => log("M0"));
log("S");`,
  teach: 'T1 里产生的微任务不会等到 T2 之后：T1 一结束就清空微任务，然后才取 T2。'
}, (t) => {
  t.phase('同步阶段');
  t.push('主脚本');
  t.tq('T1', 0);
  t.tq('T2', 0);
  t.mq('M0');
  t.log('S');
  t.pop();
  t.phase('微任务阶段');
  t.mr('M0');
  t.log('M0');
  t.pop();
  t.phase('宏任务阶段');
  t.tr('T1');
  t.log('T1');
  t.mq('M-in-T1', 'T1 内部排了一个微任务。');
  t.pop('T1 结束 → 先清空微任务，再取下一个宏任务。');
  t.phase('微任务阶段');
  t.mr('M-in-T1');
  t.log('M-in-T1');
  t.pop();
  t.phase('宏任务阶段');
  t.tr('T2');
  t.log('T2');
  t.pop();
});

add({
  id: 'seq-par', name: '串行 await vs Promise.all', level: '核心', php: '串行 await 循环 = PHP 里串行 curl；Promise.all = curl_multi / Guzzle Pool。耗时差一倍不是错觉。',
  code: `const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function seq() {
  await wait(20);
  await wait(20);
  log("seq done");
}
async function par() {
  await Promise.all([wait(20), wait(20)]);
  log("par done");
}
seq(); par();
log("start");`,
  teach: 'par 约 20ms 完成，seq 约 40ms。两个 wait 同时登记定时器 = 并发；一个等完再登记下一个 = 串行。',
  timed: true
}, (t) => {
  t.phase('同步阶段');
  t.push('主脚本');
  t.push('seq()');
  t.tq('seq 定时器1', 20, '第一个 wait(20) 登记定时器；Promise 还 pending，await 挂起。');
  t.pop();
  t.push('par()');
  t.tq('par 定时器a', 20, 'Promise.all 里两个 wait 同时登记 → 并发。');
  t.tq('par 定时器b', 20);
  t.pop();
  t.log('start');
  t.pop();
  t.phase('定时器到期（≈20ms）', '三个定时器几乎同时到期，按登记顺序进入宏任务队列。');
  t.tr('seq 定时器1');
  t.mq('seq 续体1', '定时器回调 resolve Promise → 续体进微任务。');
  t.pop();
  t.tr('par 定时器a');
  t.mq('par 计数a');
  t.pop();
  t.tr('par 定时器b');
  t.mq('par 计数b');
  t.pop();
  t.phase('微任务阶段');
  t.mr('seq 续体1');
  t.tq('seq 定时器2', 20, '第二个 await 现在才登记定时器 → 又是 20ms。');
  t.pop();
  t.mr('par 计数a');
  t.pop();
  t.mr('par 计数b');
  t.mq('par 续体', '两个都完成 → Promise.all resolve → par 续体入队。');
  t.pop();
  t.mr('par 续体');
  t.log('par done', '≈20ms：并发只花一份等待时间。');
  t.pop();
  t.phase('定时器到期（≈40ms）');
  t.tr('seq 定时器2');
  t.mq('seq 续体2');
  t.pop();
  t.phase('微任务阶段');
  t.mr('seq 续体2');
  t.log('seq done', '≈40ms：串行把等待时间加了起来。');
  t.pop();
});

add({
  id: 'async-throw', name: 'async 里的 throw 抓不到', level: '核心', php: 'PHP 的 try { f() } catch 对 async 函数不管用。必须 await 或 .catch()，否则是 unhandledRejection。',
  code: `async function boom() {
  throw new Error("只能用 await 抓");
}
try { boom(); } catch (e) { log("caught sync"); }
boom().catch(e => log("caught: " + e.message));
log("end");`,
  teach: 'async 函数里的 throw 不会穿过调用栈：它把返回的 Promise 变成 rejected。try/catch 只包住「调用」那一瞬间。'
}, (t) => {
  t.phase('同步阶段');
  t.push('主脚本');
  t.push('boom #1');
  t.note('throw 发生在 async 函数里 → 不抛向调用者，而是返回 rejected Promise。');
  t.mq('boom#1 rejected', '这个 rejected 没有 handler：稍后触发 unhandledRejection。');
  t.pop('try 块正常结束，catch 不会进。');
  t.push('boom #2');
  t.mq('boom#2 .catch', '.catch 登记了处理函数 → 安全。');
  t.pop();
  t.log('end');
  t.pop();
  t.phase('微任务阶段');
  t.mr('boom#2 .catch');
  t.log('caught: 只能用 await 抓');
  t.pop();
  t.note('boom#1 的 rejected 无人处理 → Node 默认 unhandledRejection 会让进程退出：一个请求的异常带走整台服务。');
});

add({
  id: 'nexttick', name: 'nextTick 比微任务更前', level: '进阶', php: 'PHP 无对应。Node 独有：nextTick 队列在当前操作结束后、微任务之前清空。滥用会饿死 I/O。',
  code: `setTimeout(() => log("timeout"), 0);
Promise.resolve().then(() => log("promise"));
process.nextTick(() => log("nextTick"));
log("sync");`,
  teach: 'Node 的优先级：同步 → nextTick 队列 → 微任务队列 → 宏任务。浏览器里没有 nextTick。'
}, (t) => {
  t.phase('同步阶段');
  t.push('主脚本');
  t.tq('timeout', 0);
  t.mq('promise');
  t.nt('nextTick', 'Node 独有队列：优先级高于微任务。');
  t.log('sync');
  t.pop();
  t.phase('nextTick 阶段', '当前操作结束，先清空 nextTick 队列。');
  t.nr('nextTick');
  t.log('nextTick');
  t.pop();
  t.phase('微任务阶段');
  t.mr('promise');
  t.log('promise');
  t.pop();
  t.phase('宏任务阶段');
  t.tr('timeout');
  t.log('timeout');
  t.pop();
});

/* ---------- 构建期校验：真实跑一遍，比对输出顺序 ---------- */
export async function verify() {
  const results = [];
  for (const s of SNIPPETS) {
    const expected = s.steps.filter((x) => x.kind === 'log').map((x) => x.out[x.out.length - 1]);
    const raw = await run(s.code);
    const actual = raw.filter((l) => !l.startsWith('unhandledRejection'));
    const ok = JSON.stringify(expected) === JSON.stringify(actual);
    results.push({ id: s.id, ok, expected, actual, rejected: raw.filter((l) => l.startsWith('unhandledRejection')) });
    if (!ok) console.error('  [event-loop] 输出顺序不符:', s.id, '\n   期望', expected, '\n   实际', actual);
  }
  return results;
}

function run(code) {
  // 以真正的顶层脚本运行（nextTick / 微任务的相对顺序依赖于是否在宏任务顶层）
  const wrapper =
    "const log=(...a)=>console.log(a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));\n" +
    "process.on('unhandledRejection',r=>console.log('unhandledRejection: '+(r&&r.message?r.message:r)));\n" +
    code + "\n";
  const r = spawnSync(process.execPath, ['-e', wrapper], { encoding: 'utf8', timeout: 8000 });
  const lines = (r.stdout || '').split('\n').filter((l) => l.length);
  return Promise.resolve(lines);
}

export { SNIPPETS };