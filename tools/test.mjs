import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'tools', '.shots');
fs.mkdirSync(SHOTS, { recursive: true });
const base = 'file:///' + path.join(ROOT, 'html').replace(/\\/g, '/') + '/';

const results = [];
const errors = [];
function check(name, ok, extra) { results.push({ name, ok: !!ok, extra }); if (!ok) console.log('FAIL:', name, extra || ''); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()));
const go = async (u) => { await page.goto(base + u, { waitUntil: 'networkidle0', timeout: 60000 }); await new Promise((r) => setTimeout(r, 500)); };
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
const txt = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const click = async (sel) => { await page.$eval(sel, (e) => e.click()); await new Promise((r) => setTimeout(r, 250)); };

/* ---------- A 首页 ---------- */
await go('index.html');
check('home: 6 教材卡', await page.$$eval('.track-card', (e) => e.length) === 6);
check('home: 5 实验台卡', await page.$$eval('.lab-card', (e) => e.length) === 5);
await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
await new Promise((r) => setTimeout(r, 600));
check('home: Ctrl+K 打开搜索', await page.$eval('#searchModal', (e) => !e.hidden));
await page.type('#searchInput', '乐观锁');
await new Promise((r) => setTimeout(r, 400));
const nRes = await page.$$eval('.sr-item', (e) => e.length);
check('home: 搜索「乐观锁」有结果', nRes > 0, nRes);
await shot('search');
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));
check('home: Esc 关闭搜索', await page.$eval('#searchModal', (e) => e.hidden));

/* ---------- B 教材页 ---------- */
await go('typescript.html#docs03-js运行时与事件循环');
check('ts: 章节 03 可见', await page.$eval('#docs03-js运行时与事件循环', (e) => !e.hidden));
check('ts: 标题正确', (await txt('.chapter:not([hidden]) .ch-title')).includes('事件循环'));
check('ts: TOC 有条目', await page.$$eval('#tocScroll .toc-l', (e) => e.length) > 5);
await click('.chapter:not([hidden]) .mark-read');
check('ts: 标记已读生效', await page.$eval('.chapter:not([hidden]) .mark-read', (e) => e.classList.contains('on')));
check('ts: 侧栏进度 > 0', (await txt('#sbPct')) !== '0%');
await click('.chapter:not([hidden]) .coderef');
await new Promise((r) => setTimeout(r, 700));
check('ts: 代码抽屉打开', await page.$eval('#codeDrawer', (e) => !e.hidden));
const drawerLen = await page.$eval('#drawerBody', (e) => e.textContent.length);
check('ts: 抽屉有代码内容', drawerLen > 200, drawerLen);
await shot('drawer');
await click('#drawerClose');
check('ts: 抽屉关闭', await page.$eval('#codeDrawer', (e) => e.hidden));
const revSel = '.chapter:not([hidden]) .reveal .reveal-btn';
if (await page.$(revSel)) {
  await click(revSel);
  check('ts: 折叠答案展开', await page.$eval('.chapter:not([hidden]) .reveal .reveal-panel', (e) => !e.hidden));
}
await click('.chapter:not([hidden]) .note-open');
await page.type('.chapter:not([hidden]) .note-input', 'await 是让出点，不是原子边界。');
await new Promise((r) => setTimeout(r, 600));
check('ts: 笔记保存状态', (await txt('.chapter:not([hidden]) .note-status')).includes('已保存'));
// 侧栏切换章节
await click('.sb-item[data-chapter="docs08-数据访问与事务"]');
check('ts: 侧栏切换到 08', await page.$eval('#docs08-数据访问与事务', (e) => !e.hidden));
// 主题
await click('#themeToggle');
check('ts: 切换浅色', await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light');
await shot('ts-light');
await click('#themeToggle');
// 表格 / 代码存在
check('ts: 对照表存在', await page.$$eval('.chapter:not([hidden]) .table-wrap.cmp', (e) => e.length) > 0);
check('ts: 代码块存在', await page.$$eval('.chapter:not([hidden]) figure.code', (e) => e.length) > 3);

/* ---------- C 事件循环 ---------- */
await go('labs/event-loop.html');
check('el: 8 片段', await page.$$eval('#elSnippet option', (e) => e.length) === 8);
check('el: 校验 8/8', (await txt('#elVerified')) === '8/8');
for (let i = 0; i < 11; i++) await click('#elNext');
const outLines = await page.$$eval('#elOut .cl', (e) => e.length);
check('el: 单步产生输出', outLines >= 3, outLines);
await shot('el-mid');
await click('#elPlay');
await new Promise((r) => setTimeout(r, 2500));
const stepTxt = await txt('#elStep');
check('el: 播放推进', !/步骤 10 /.test(stepTxt), stepTxt);
await click('#elPlay');
await page.select('#elSnippet', '1');
await new Promise((r) => setTimeout(r, 300));
check('el: 切换片段', (await txt('#elSnippetTag')).startsWith('await-race'));
await page.$eval('#elScrub', (e) => { e.value = e.max; e.dispatchEvent(new Event('input')); });
await new Promise((r) => setTimeout(r, 300));
const raceOut = await page.$eval('#elOut', (e) => e.textContent);
check('el: 竞态片段输出 -20', raceOut.includes('balance=-20'), raceOut.slice(-60));
await shot('el-race');

/* ---------- D K8s ---------- */
await go('labs/k8s-port.html');
await page.waitForFunction(() => +document.querySelector('#k8sReady').textContent === 3, { timeout: 15000 });
check('k8s: 自愈追平期望 3', true);
await click('#k8sKill');
await new Promise((r) => setTimeout(r, 300));
check('k8s: 杀 Pod 后重建计数', +(await txt('#k8sRestarts')) >= 1);
await page.waitForFunction(() => +document.querySelector('#k8sReady').textContent === 3, { timeout: 15000 });
check('k8s: 杀后自愈回 3', true);
await click('#k8sVer button[data-v="v2"]');
await page.waitForFunction(() => document.querySelector('#k8sTick').textContent.indexOf('滚动更新中') < 0 && +document.querySelector('#k8sReady').textContent === 3, { timeout: 20000 });
check('k8s: 滚动更新完成', true);
await shot('k8s-rollout');
await click('#k8sHpa');
await page.$eval('#k8sLoad', (e) => { e.value = 400; e.dispatchEvent(new Event('input')); });
let hpaOk = false;
for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 700)); if (+(await txt('#k8sDesired')) > 3) { hpaOk = true; break; } }
if (!hpaOk) console.log('HPA DIAG', JSON.stringify(await page.evaluate(() => ({ checked: document.querySelector('#k8sHpa').checked, load: document.querySelector('#k8sLoadOut').textContent, desired: document.querySelector('#k8sDesired').textContent, ev: document.querySelector('#k8sEvents').textContent.slice(0, 220) }))));
check('k8s: HPA 扩容', hpaOk, await txt('#k8sDesired'));
await click('#k8sPause');
await click('#k8sKill');
await new Promise((r) => setTimeout(r, 1200));
const gapPaused = await txt('#k8sDiff');
check('k8s: 暂停后不自愈', gapPaused !== '0', gapPaused);
await shot('k8s-paused');

/* ---------- E 类型边界 ---------- */
await go('labs/type-boundary.html');
await new Promise((r) => setTimeout(r, 600));
check('tb: 默认 PASS', (await txt('#tbStatus')) === 'PASS');
await click('#tbPresets button[data-i="1"]');
check('tb: 缺字段 FAIL', (await txt('#tbStatus')) === 'FAIL');
check('tb: 错误键 customerName', (await page.$eval('#tbResult', (e) => e.textContent)).includes('customerName'));
check('tb: problem+json 400', (await page.$eval('#tbProblem', (e) => e.textContent)).includes('"status": 400'));
await shot('tb-fail');
await click('#tbPresets button[data-i="6"]');
check('tb: strip 丢弃多余字段仍 PASS', (await txt('#tbStatus')) === 'PASS');
await click('#tbUnknown button[data-v="strict"]');
check('tb: strict 下多余字段 FAIL', (await txt('#tbStatus')) === 'FAIL');
await click('#tbPresets button[data-i="4"]');
await click('#tbUnknown button[data-v="strip"]');
check('tb: 字符串 quantity FAIL', (await txt('#tbStatus')) === 'FAIL');
await click('#tbCoerce');
check('tb: coerce 后 PASS', (await txt('#tbStatus')) === 'PASS');
check('tb: 金额整数分 30', (await txt('#tbCents')) === '30');

/* ---------- F 请求生命周期 ---------- */
await go('labs/request-lifecycle.html');
await new Promise((r) => setTimeout(r, 500));
await click('#rlSend');
await page.waitForFunction(() => document.querySelector('#rlStatus').textContent.includes('201'), { timeout: 20000 });
check('rl: 合法下单 201', true);
check('rl: 库存 20→18', (await page.$eval('#rlDb', (e) => e.textContent)).includes('18'));
await shot('rl-201');
await click('#rlRace');
await click('#rlSend');
await page.waitForFunction(() => document.querySelector('#rlStatus').textContent.includes('409'), { timeout: 20000 });
check('rl: 并发乐观锁 409', true);
await click('#rlRace');
await click('#rlAuth');
await click('#rlSend');
await page.waitForFunction(() => document.querySelector('#rlStatus').textContent.includes('401'), { timeout: 20000 });
check('rl: 无认证 401', true);
await click('#rlAuth');
await click('#rlMethod button[data-v="delete"]');
await click('#rlSend');
await page.waitForFunction(() => document.querySelector('#rlStatus').textContent.includes('403'), { timeout: 20000 });
check('rl: customer 删除 403', true);
await click('#rlRole button[data-v="admin"]');
await click('#rlSend');
await page.waitForFunction(() => document.querySelector('#rlStatus').textContent.includes('409') || document.querySelector('#rlStatus').textContent.includes('204'), { timeout: 20000 });
check('rl: admin 删除（被引用 409）', (await page.$eval('#rlStatus', (e) => e.textContent)).includes('409'));

/* ---------- G 速查表 ---------- */
await go('labs/cheatsheet.html');
const allRows = await page.$$eval('#csTable tbody tr', (e) => e.length);
check('cs: 合并行数 > 200', allRows > 200, allRows);
await page.type('#csQuery', 'array_map');
await new Promise((r) => setTimeout(r, 300));
const qRows = await page.$$eval('#csTable tbody tr', (e) => e.length);
check('cs: 过滤生效', qRows > 0 && qRows < allRows, qRows);
await page.$eval('#csQuery', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
await click('#csPit');
const pitRows = await page.$$eval('#csTable tbody tr', (e) => e.length);
check('cs: 只看坑', pitRows > 0 && pitRows < allRows, pitRows);
await shot('cs');
await click('#csTrack button[data-t="ack-k8s"]');
check('cs: 切换 K8s', (await page.$eval('#csTable thead', (e) => e.textContent)).includes('港口类比'));

/* ---------- H 移动端 ---------- */
await page.setViewport({ width: 390, height: 844 });
await go('index.html');
check('mob: 首页无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await shot('mob-home');
await go('typescript.html#docs03-js运行时与事件循环');
check('mob: 教材页无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await click('#menuToggle');
check('mob: 侧栏打开', await page.$eval('#sidebar', (e) => e.classList.contains('open')));
await shot('mob-sidebar');
await click('#sbScrim');
await go('labs/event-loop.html');
check('mob: 实验台无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await shot('mob-el');
await go('labs/k8s-port.html');
check('mob: K8s 无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

console.log('\n==== 结果 ====');
const fail = results.filter((r) => !r.ok);
console.log(results.length + ' 项检查，' + fail.length + ' 失败');
console.log('运行时错误:', errors.length ? errors.slice(0, 15) : '无');
fs.writeFileSync(path.join(SHOTS, 'test-results.json'), JSON.stringify({ results, errors }, null, 2));
await browser.close();
process.exit(fail.length || errors.length ? 1 : 0);