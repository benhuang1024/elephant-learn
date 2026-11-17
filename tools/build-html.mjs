import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDocument, escapeHtml } from './lib/markdown.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'html');

const TRACKS = [
  {
    id: 'typescript', dir: 'typescript', name: 'TypeScript + NestJS', short: 'TypeScript',
    tagline: '全栈速成 · Node 24 / TS 7 / NestJS 12 / React 19 / Vue 3.5 / Next 16',
    hue: 'blue', accent: '#4C9AFF', accent2: '#F7DF1E', glyph: 'TS',
    weeks: '3～4 周', level: '★★★★★',
    why: 'PHP 直觉失效最密集的一套：常驻进程、事件循环、类型擦除、结构化类型。',
    labs: [{ href: 'labs/event-loop.html', name: '事件循环实验台', desc: '把微任务/宏任务逐帧拆开看' },
      { href: 'labs/type-boundary.html', name: '类型擦除与边界校验', desc: '亲手把脏 JSON 打进 DTO' },
      { href: 'labs/request-lifecycle.html', name: '一个请求的生命周期', desc: 'Middleware→Guard→Pipe→Filter' }]
  },
  {
    id: 'python', dir: 'python', name: 'Python + FastAPI', short: 'Python',
    tagline: '速成 · Python 3.14 / uv / FastAPI / Pydantic 2 / SQLAlchemy 2.1 / Django 6',
    hue: 'amber', accent: '#FFD43B', accent2: '#4B8BBE', glyph: 'Py',
    weeks: '2～3 周', level: '★★★★★',
    why: '缩进、可变默认参数、GIL 与 asyncio、Session/Unit of Work 的边界。',
    labs: [{ href: 'labs/cheatsheet.html?track=python', name: 'PHP → Python 速查', desc: '函数级对照，即时过滤' }]
  },
  {
    id: 'java', dir: 'java', name: 'Java + Spring Boot', short: 'Java',
    tagline: '速成 · Java 25 LTS / Spring Boot 4.1 / Spring Framework 7 / Maven',
    hue: 'orange', accent: '#FF8A4C', accent2: '#5382A1', glyph: 'Jv',
    weeks: '2～3 周', level: '★★★★',
    why: 'JVM 内存与线程模型、IoC/AOP 代理、Hibernate 事务与乐观锁。',
    labs: [{ href: 'labs/cheatsheet.html?track=java', name: 'PHP → Java 速查', desc: '函数级对照，即时过滤' }]
  },
  {
    id: 'ack-k8s', dir: 'ack-k8s', name: 'Kubernetes 与阿里云 ACK', short: 'ACK / K8s',
    tagline: '集装箱港口类比 · 从一台电脑到云 · 实战部署 Spring Boot 与 Magento',
    hue: 'cyan', accent: '#37D6FF', accent2: '#326CE5', glyph: 'K8',
    weeks: '2 周', level: '★★★★',
    why: '期望状态与自愈：把「发布/扩容/回滚」从运维动作变成声明式账本。',
    labs: [{ href: 'labs/k8s-port.html', name: '港口调度模拟器', desc: '杀 Pod、滚动更新、HPA 扩容' },
      { href: 'labs/cheatsheet.html?track=ack-k8s', name: '概念对照速查', desc: '类比 ↔ 真实对象 ↔ kubectl' }]
  },
  {
    id: 'security', dir: 'security', name: '安全工程', short: '安全',
    tagline: 'Web 安全 / 安全编码 / 基础设施与云 / 攻防与 CTF（授权范围内）',
    hue: 'green', accent: '#37E39B', accent2: '#FF4D5E', glyph: 'Se',
    weeks: '按需', level: '★★★★',
    why: '把「架构评审里的安全清单」变成可执行的检查项与实验。',
    labs: [{ href: 'labs/cheatsheet.html?track=security', name: '安全清单速查', desc: '评审前逐条过' }]
  },
  {
    id: 'project-communication', dir: 'project-communication', name: '项目沟通与甲方管理', short: '项目沟通',
    tagline: '角色认知 / 说服甲方 / 需求变更 / 资源协调 / 突发事件 / 谈判 / 话术库',
    hue: 'magenta', accent: '#FF7AB8', accent2: '#FFB020', glyph: 'Pm',
    weeks: '按需', level: '★★★',
    why: '架构师的另一半工作：把技术决策翻译成干系人能接受的语言。',
    labs: []
  }
];

/* ---------- 文件索引 ---------- */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.venv', 'target', 'build', '.next', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache']);
const allFiles = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(abs, r);
    else allFiles.push({ abs, rel: r });
  }
})(ROOT, '');

const fileSet = new Set(allFiles.map((f) => f.rel));
const dirSet = new Set();
for (const f of allFiles) {
  const parts = f.rel.split('/');
  for (let i = 1; i < parts.length; i++) dirSet.add(parts.slice(0, i).join('/'));
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[`*_~[\]()（）「」『』《》:：,，.。!！?？/\\|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || 'x';
}

/* ---------- 收集每个 track 的文档 ---------- */
function orderDocs(track) {
  const files = allFiles.filter((f) => f.rel.startsWith(track.dir + '/') && f.rel.endsWith('.md'));
  const score = (rel) => {
    const base = rel.slice(track.dir.length + 1);
    if (base === 'README.md') return [0, ''];
    if (/^templates\/README\.md$/.test(base)) return [8, base];
    if (/^templates\//.test(base)) return [9, base];
    if (/^附录/.test(base)) return [7, base];
    if (/^(resources|note-template)\.md$/.test(base)) return [7.5, base];
    const num = /^(\d+)/.exec(base);
    if (num) return [1, base.padStart(60, '0')];
    const sub = /^(\d+)-[^/]+\/README\.md$/.exec(base);
    if (sub) return [2, base];
    const subFile = /^(\d+)-[^/]+\/(.+)$/.exec(base);
    if (subFile) return [3, base];
    return [5, base];
  };
  return files.sort((a, b) => {
    const sa = score(a.rel), sb = score(b.rel);
    if (sa[0] !== sb[0]) return sa[0] - sb[0];
    return sa[1] < sb[1] ? -1 : sa[1] > sb[1] ? 1 : 0;
  });
}

const chapters = [];   // {track, id, file, title, html, toc, words, codeBlocks, minutes, group}
const docByFile = new Map();

for (const t of TRACKS) {
  const docs = orderDocs(t);
  t.docs = docs;
  for (const f of docs) {
    const base = f.rel.slice(t.dir.length + 1).replace(/\.md$/, '');
    const id = slugify(base);
    const raw = fs.readFileSync(f.abs, 'utf8');
    const heads = raw.split('\n').filter((l) => /^#\s+/.test(l));
    const title = heads.length ? heads[0].replace(/^#\s+/, '').trim() : base;
    const ch = { track: t.id, id, file: f.rel, base, title, raw, group: base.includes('/') ? base.split('/')[0] : '' };
    chapters.push(ch);
    docByFile.set(f.rel, ch);
  }
}

/* ---------- 链接解析 ---------- */
function resolveLink(href, fromFile) {
  if (!href) return { kind: 'external', href: '#' };
  if (/^(https?:|mailto:)/i.test(href)) return { kind: 'external', href };
  if (href.startsWith('#')) return { kind: 'anchor', href };
  const clean = href.split('#')[0];
  if (!clean) return { kind: 'anchor', href };
  const fromDir = path.posix.dirname(fromFile);
  const target = path.posix.normalize(path.posix.join(fromDir, clean));
  if (docByFile.has(target)) {
    const ch = docByFile.get(target);
    return { kind: 'doc', href: ch.track + '.html#' + ch.id, target: ch.track + '/' + ch.id };
  }
  if (fileSet.has(target)) return { kind: 'code', path: target, href: '#code' };
  if (dirSet.has(target.replace(/\/$/, ''))) return { kind: 'code', path: target.replace(/\/$/, '') + '/', href: '#code' };
  return { kind: 'missing', href };
}

/* ---------- 渲染 ---------- */
const usedCode = new Map();  // track -> Set(paths)
function noteCode(p) {
  const top = p.split('/')[0];
  const t = TRACKS.find((x) => x.dir === top);
  if (!t) return;
  if (!usedCode.has(t.id)) usedCode.set(t.id, new Set());
  usedCode.get(t.id).add(p);
}

function readingMinutes(raw) {
  const cjk = (raw.match(/[一-鿿]/g) || []).length;
  const latin = (raw.replace(/[一-鿿]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
  return Math.max(2, Math.round(cjk / 380 + latin / 220));
}

for (const ch of chapters) {
  const codeRefs = new Set();
  const seen = new Map();
  const ctx = {
    file: ch.file,
    codeRefs,
    resolveLink,
    slug(text) {
      const s = slugify(text);
      const key = ch.id + '--' + s;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      return n > 1 ? key + '-' + n : key;
    }
  };
  const res = renderDocument(ch.raw, ctx);
  ch.title = res.title || ch.title;
  ch.html = res.html;
  ch.toc = res.toc;
  ch.minutes = readingMinutes(ch.raw);
  ch.codeBlocks = ctx.codeBlocks || 0;
  ch.words = (ch.raw.match(/[一-鿿]/g) || []).length;
  for (const p of codeRefs) noteCode(p);
}

/* ---------- 精讲扩展 ---------- */
const DEEP_DIR = path.join(HERE, 'deep');
let deepCount = 0;
if (fs.existsSync(DEEP_DIR)) {
  for (const t of TRACKS) {
    const dir = path.join(DEEP_DIR, t.id);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const key = f.replace(/\.md$/, '');
      const ch = chapters.find((c) => c.track === t.id && (c.id === slugify(key) || c.base === key || c.base.endsWith('/' + key)));
      if (!ch) { console.warn('  [deep] 未匹配章节:', t.id, key); continue; }
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const seen = new Map();
      const ctx = {
        file: ch.file, codeRefs: new Set(), resolveLink,
        slug(text) {
          const s = slugify(text); const k = ch.id + '--deep-' + s;
          const n = (seen.get(k) || 0) + 1; seen.set(k, n);
          return n > 1 ? k + '-' + n : k;
        }
      };
      const res = renderDocument(raw, ctx);
      ch.html += `<section class="deep-dive" id="${ch.id}--deep"><header class="deep-head">` +
        `<span class="deep-badge">架构师精讲</span><h2>${escapeHtml(res.title || '展开讲解')}</h2>` +
        `<p class="deep-sub">这一段是教材之外的展开：把结论背后的机制、代价与生产做法讲透。</p></header>` +
        res.html + `</section>`;
      ch.toc.push({ level: 2, id: ch.id + '--deep', text: '架构师精讲 · ' + (res.title || '展开'), deep: true });
      ch.minutes += readingMinutes(raw);
      deepCount++;
    }
  }
}

/* ---------- 代码包 ---------- */
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|java|py|php|vue|yaml|yml|json|jsonc|xml|sql|sh|bash|css|scss|html|toml|ini|conf|properties|env|md|txt|lock|gitignore|dockerignore|example|template|mako|cmd|pyi)$/i;
const CODE_NAME = /^(Dockerfile|Makefile|mvnw|\.env\.example|\.python-version|\.gitignore|\.dockerignore|compose\.yaml|pom\.xml|package\.json|tsconfig.*\.json|pyproject\.toml|uv\.lock|alembic\.ini|drizzle\.config\.ts)$/i;
function langOf(p) {
  const b = path.posix.basename(p);
  if (/^Dockerfile/.test(b)) return 'dockerfile';
  if (/^(mvnw|\.gitignore|\.dockerignore|\.python-version|\.env)/.test(b)) return b.startsWith('.env') ? 'bash' : 'text';
  if (/\.conf$/.test(b)) return 'nginx';
  if (/\.(ini|properties)$/.test(b)) return 'ini';
  if (/\.mako$/.test(b)) return 'html';
  const ext = path.posix.extname(b).slice(1).toLowerCase();
  return ext || 'text';
}
let codeFiles = 0, codeBytes = 0;
for (const t of TRACKS) {
  const files = allFiles.filter((f) => {
    if (!f.rel.startsWith(t.dir + '/')) return false;
    if (f.rel.endsWith('.md')) return false;
    if (/\/(node_modules|dist|\.venv|target)\//.test(f.rel)) return false;
    if (/(uv\.lock|pnpm-lock\.yaml|package-lock\.json)$/.test(f.rel)) return false;
    const b = path.posix.basename(f.rel);
    return CODE_EXT.test(b) || CODE_NAME.test(b);
  });
  const obj = {};
  for (const f of files) {
    const st = fs.statSync(f.abs);
    if (st.size > 220 * 1024) continue;
    obj[f.rel] = { l: langOf(f.rel), s: st.size, t: fs.readFileSync(f.abs, 'utf8') };
    codeFiles++; codeBytes += st.size;
  }
  const dirs = {};
  for (const f of files) {
    const parts = f.rel.split('/');
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join('/') + '/';
      (dirs[d] = dirs[d] || []).push(f.rel);
    }
  }
  fs.mkdirSync(path.join(OUT, 'assets', 'code'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'assets', 'code', t.id + '.js'),
    'window.__CODE__=window.__CODE__||{};window.__CODE__[' + JSON.stringify(t.id) + ']=' +
    JSON.stringify({ files: obj, dirs }) + ';\n');
}

/* ---------- 搜索索引 ---------- */
const searchIndex = chapters.map((ch) => {
  const text = ch.raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`|_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    t: ch.track, id: ch.id, title: ch.title,
    h: ch.toc.filter((x) => !x.deep).map((x) => x.text),
    body: text.slice(0, 2600)
  };
});
fs.writeFileSync(path.join(OUT, 'assets', 'search-index.js'), 'window.__SEARCH__=' + JSON.stringify(searchIndex) + ';\n');

/* ---------- 页面模板 ---------- */
const NAV_TRACKS = TRACKS.map((t) => `<a class="nav-track" href="${t.id}.html" data-track="${t.id}" style="--ta:${t.accent}"><span class="nt-glyph">${t.glyph}</span><span class="nt-name">${t.short}</span></a>`).join('');

function head(title, desc, depth = '', extraCss = []) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="${depth}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${depth}assets/fonts.css">
<link rel="stylesheet" href="${depth}assets/app.css">
${extraCss.map((c) => `<link rel="stylesheet" href="${depth}assets/${c}">`).join('\n')}
</head>`;
}

function topbar(active, depth = '') {
  return `<header class="topbar" id="topbar">
  <div class="tb-inner">
    <a class="brand" href="${depth}index.html">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40"><path d="M8 26c0-8 5-14 12-14s12 6 12 14v6h-5v-5h-4v5h-6v-5h-4v5H8z" fill="currentColor"/><circle cx="26.5" cy="19" r="1.7" fill="#0B0E14"/><path d="M32 24c3 1 4 4 3 7" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>
      </span>
      <span class="brand-text"><b>大象学堂</b><i>PHP 架构师的第二语言</i></span>
    </a>
    <nav class="nav-tracks" aria-label="教材切换">${NAV_TRACKS}</nav>
    <div class="tb-actions">
      <button class="tb-btn search-btn" id="searchOpen" type="button" aria-label="搜索全部教材">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.6 10.6 3.4 3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <span class="sb-text">搜索</span><kbd>Ctrl K</kbd>
      </button>
      <button class="tb-btn icon" id="soundToggle" type="button" aria-pressed="true" aria-label="音效开关" title="音效：开">
        <svg class="i-on" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2.5L9 3v10L5.5 10H3z" fill="currentColor"/><path d="M11.2 5.4a3.6 3.6 0 0 1 0 5.2M13 3.6a6 6 0 0 1 0 8.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <svg class="i-off" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2.5L9 3v10L5.5 10H3z" fill="currentColor"/><path d="m11.4 6 3.2 4M14.6 6l-3.2 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <button class="tb-btn icon" id="themeToggle" type="button" aria-label="切换深浅色" title="切换深浅色">
        <svg class="i-moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.8 5.8 0 1 0 6.6 6.6z" fill="currentColor"/></svg>
        <svg class="i-sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3 3l1.3 1.3M11.7 11.7 13 13M13 3l-1.3 1.3M4.3 11.7 3 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
      <a class="tb-btn icon" href="${depth}labs/index.html" aria-label="实验台" title="交互实验台">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2h4M6.5 2v4.2L3.4 12a1.6 1.6 0 0 0 1.4 2.4h6.4A1.6 1.6 0 0 0 12.6 12L9.5 6.2V2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M4.6 10h6.8" stroke="currentColor" stroke-width="1.4"/></svg>
      </a>
      <button class="tb-btn icon menu-btn" id="menuToggle" type="button" aria-label="目录" aria-expanded="false">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </div>
  </div>
  <div class="read-progress" id="readProgress"><i></i></div>
</header>`;
}

function searchModal(depth = '') {
  return `<div class="modal" id="searchModal" hidden role="dialog" aria-modal="true" aria-label="搜索教材">
  <div class="modal-scrim" data-close></div>
  <div class="search-panel">
    <div class="search-input">
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.6 10.6 3.4 3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input id="searchInput" type="search" placeholder="搜索 6 套教材：事件循环 / 乐观锁 / GIL / Pod / 变更控制…" autocomplete="off" spellcheck="false">
      <kbd>Esc</kbd>
    </div>
    <div class="search-filter" id="searchFilter"></div>
    <div class="search-results" id="searchResults"></div>
    <div class="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span id="searchCount"></span></div>
  </div>
</div>`;
}

function codeDrawer(depth = '') {
  return `<div class="drawer" id="codeDrawer" hidden>
  <div class="drawer-scrim" data-close></div>
  <aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="配套代码">
    <header class="drawer-head">
      <div class="dh-title"><span class="dh-kicker">配套代码</span><h3 id="drawerTitle">—</h3></div>
      <div class="dh-actions">
        <button class="tb-btn" id="drawerCopy" type="button">复制全文</button>
        <button class="tb-btn icon" id="drawerClose" type="button" aria-label="关闭">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
      </div>
    </header>
    <div class="drawer-path" id="drawerPath"></div>
    <div class="drawer-body" id="drawerBody"></div>
  </aside>
</div>`;
}

function bgLayers() {
  return `<div class="bg" aria-hidden="true">
  <div class="bg-aurora a1"></div><div class="bg-aurora a2"></div><div class="bg-aurora a3"></div>
  <div class="bg-grid"></div><div class="bg-grain"></div>
</div>`;
}

function scripts(depth, pageData) {
  return `<script>window.__PAGE__=${JSON.stringify(pageData)};</script>
<script src="${depth}assets/highlight.js"></script>
<script src="${depth}assets/app.js"></script>`;
}

/* ---------- track 页面 ---------- */
function trackPage(t) {
  const chs = chapters.filter((c) => c.track === t.id);
  const totalMin = chs.reduce((s, c) => s + c.minutes, 0);
  const groups = [];
  for (const c of chs) {
    const g = c.group || '正文';
    let bucket = groups.find((x) => x.name === g);
    if (!bucket) { bucket = { name: g, items: [] }; groups.push(bucket); }
    bucket.items.push(c);
  }
  const sidebar = groups.map((g) => {
    const label = g.name === '正文' ? (t.id === 'security' ? '总览' : '章节') : g.name.replace(/^\d+-/, '');
    return `<div class="sb-group"><div class="sb-group-title">${escapeHtml(label)}</div>` +
      g.items.map((c, k) => `<a class="sb-item" href="#${c.id}" data-chapter="${c.id}">
        <span class="sb-num">${String(k + 1).padStart(2, '0')}</span>
        <span class="sb-label">${escapeHtml(c.title.replace(/^\d+[-\s]*/, ''))}</span>
        <span class="sb-meta">${c.minutes}′</span>
        <span class="sb-done" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 8.5 3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </a>`).join('') + '</div>';
  }).join('');

  const articles = chs.map((c, idx) => {
    const toc = c.toc.filter((x) => x.level >= 2).map((x) =>
      `<a class="toc-l l${x.level}${x.deep ? ' deep' : ''}" href="#${x.id}" data-target="${x.id}">${escapeHtml(x.text)}</a>`).join('');
    const prev = chs[idx - 1], next = chs[idx + 1];
    const labLinks = (t.labs || []).map((l) => `<a class="lab-chip" href="${l.href}"><span class="lc-dot"></span>${escapeHtml(l.name)}</a>`).join('');
    return `<article class="chapter" id="${c.id}" data-chapter="${c.id}" data-minutes="${c.minutes}" hidden>
      <header class="ch-head">
        <div class="ch-kicker"><span class="ch-track">${escapeHtml(t.short)}</span><span class="ch-sep">/</span><span>${escapeHtml(c.base)}</span></div>
        <h1 class="ch-title">${escapeHtml(c.title)}</h1>
        <div class="ch-meta">
          <span class="chip"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>约 ${c.minutes} 分钟</span>
          <span class="chip">${c.codeBlocks} 段代码</span>
          <span class="chip">${c.words} 字</span>
          <button class="chip btn mark-read" data-chapter="${c.id}" type="button"><span class="mr-box"></span><span class="mr-text">标记已读</span></button>
          <button class="chip btn note-open" data-chapter="${c.id}" type="button">写笔记</button>
        </div>
        ${labLinks ? `<div class="ch-labs">${labLinks}</div>` : ''}
      </header>
      <div class="ch-body">${c.html}</div>
      <section class="note-zone" data-chapter="${c.id}" hidden>
        <h4>我的笔记 · ${escapeHtml(c.title)}</h4>
        <textarea class="note-input" data-chapter="${c.id}" placeholder="用自己的话复述这一章最反直觉的一点。写给三个月后的自己。" spellcheck="false"></textarea>
        <div class="note-actions"><span class="note-status"></span><button class="tb-btn note-export" type="button">导出全部笔记</button></div>
      </section>
      <nav class="pager">
        ${prev ? `<a class="pg prev" href="#${prev.id}"><span>上一章</span><b>${escapeHtml(prev.title.replace(/^\d+[-\s]*/, ''))}</b></a>` : '<span class="pg empty"></span>'}
        ${next ? `<a class="pg next" href="#${next.id}"><span>下一章</span><b>${escapeHtml(next.title.replace(/^\d+[-\s]*/, ''))}</b></a>` : `<a class="pg next" href="index.html"><span>回到</span><b>学习中心</b></a>`}
      </nav>
      <div class="ch-toc-data" hidden>${toc}</div>
    </article>`;
  }).join('\n');

  const data = {
    kind: 'track', track: t.id, name: t.name, accent: t.accent,
    chapters: chs.map((c) => ({ id: c.id, title: c.title, minutes: c.minutes, base: c.base })),
    labs: t.labs || []
  };

  return `${head(t.name + ' · 大象学堂', t.tagline)}
<body class="track-page" data-track="${t.id}" style="--ta:${t.accent};--ta2:${t.accent2}">
${bgLayers()}
${topbar(t.id)}
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <div class="sb-head">
      <div class="sb-track"><span class="sb-glyph">${t.glyph}</span><div><b>${escapeHtml(t.name)}</b><i>${chs.length} 章 · 约 ${Math.round(totalMin / 60)} 小时</i></div></div>
      <div class="sb-progress"><div class="sb-bar"><i id="sbBar"></i></div><span id="sbPct">0%</span></div>
      <div class="sb-tools">
        <button class="sb-tool" id="resumeBtn" type="button">继续上次</button>
        <button class="sb-tool" id="resetProgress" type="button">重置进度</button>
      </div>
    </div>
    <div class="sb-scroll">${sidebar}</div>
    ${t.labs && t.labs.length ? `<div class="sb-labs"><div class="sb-group-title">交互实验台</div>${t.labs.map((l) => `<a class="sb-lab" href="${l.href}"><b>${escapeHtml(l.name)}</b><i>${escapeHtml(l.desc)}</i></a>`).join('')}</div>` : ''}
  </aside>
  <main class="main" id="main">
    <div class="chapters">${articles}</div>
  </main>
  <aside class="toc" id="toc"><div class="toc-title">本章目录</div><div class="toc-scroll" id="tocScroll"></div>
    <div class="toc-foot"><a href="labs/index.html">全部实验台 →</a></div>
  </aside>
</div>
<div class="sb-scrim" id="sbScrim" hidden></div>
${codeDrawer()}
${searchModal()}
${scripts('', data)}
</body></html>`;
}

/* ---------- 首页 ---------- */
function indexPage() {
  const totalChapters = chapters.length;
  const totalMin = chapters.reduce((s, c) => s + c.minutes, 0);
  const cards = TRACKS.map((t) => {
    const chs = chapters.filter((c) => c.track === t.id);
    const min = chs.reduce((s, c) => s + c.minutes, 0);
    return `<a class="track-card" href="${t.id}.html" data-track="${t.id}" style="--ta:${t.accent};--ta2:${t.accent2}">
      <div class="tc-top"><span class="tc-glyph">${t.glyph}</span><span class="tc-level">${t.level}</span></div>
      <h3>${escapeHtml(t.name)}</h3>
      <p class="tc-tag">${escapeHtml(t.tagline)}</p>
      <p class="tc-why">${escapeHtml(t.why)}</p>
      <div class="tc-stats"><span><b>${chs.length}</b> 章</span><span><b>${Math.round(min / 60)}</b> 小时</span><span><b>${t.weeks}</b></span></div>
      <div class="tc-bar"><i data-track-bar="${t.id}"></i></div>
      <div class="tc-go"><span class="tc-pct" data-track-pct="${t.id}">未开始</span><span class="tc-arrow">→</span></div>
    </a>`;
  }).join('');

  const labCards = [
    { href: 'labs/event-loop.html', name: '事件循环实验台', track: 'TypeScript', accent: '#4C9AFF', desc: '单线程常驻进程里，微任务永远插队在宏任务前面。逐帧看调用栈、微任务队列、宏任务队列怎么轮转，代码可改、顺序可预测。', tag: '最该先玩' },
    { href: 'labs/k8s-port.html', name: '港口调度模拟器', track: 'ACK / K8s', accent: '#37D6FF', desc: '一个会自愈的集装箱港口：改副本数、随机杀 Pod、滚动更新、压测触发 HPA。期望状态与实际状态的差值实时可见。', tag: '可视化' },
    { href: 'labs/type-boundary.html', name: '类型擦除与边界校验', track: 'TypeScript', accent: '#F7DF1E', desc: 'TS 的类型在运行时一个字节都不剩。把脏 JSON 打进 DTO，看编译器沉默、Zod 拦截，理解「类型 ≠ 校验」。', tag: '最贵的坑' },
    { href: 'labs/request-lifecycle.html', name: '一个请求的生命周期', track: 'NestJS', accent: '#FF7AB8', desc: 'Middleware → Guard → Interceptor → Pipe → Controller → Service → Filter，逐站点亮，真实状态码与 problem+json 载荷。', tag: '串起后端' },
    { href: 'labs/cheatsheet.html', name: 'PHP → X 速查表', track: '全部教材', accent: '#37E39B', desc: '六套教材的附录对照表合并成一张可即时过滤的大表：函数、语法、框架概念、常见坑。', tag: '随时查' }
  ].map((l) => `<a class="lab-card" href="${l.href}" style="--ta:${l.accent}">
      <span class="lc-tag">${l.tag}</span><h4>${escapeHtml(l.name)}</h4>
      <p>${escapeHtml(l.desc)}</p><span class="lc-track">${escapeHtml(l.track)} →</span>
    </a>`).join('');

  const data = { kind: 'home', tracks: TRACKS.map((t) => ({ id: t.id, name: t.name, chapters: chapters.filter((c) => c.track === t.id).map((c) => c.id) })) };

  return `${head('大象学堂 · PHP 架构师的第二语言', '把仓库里 6 套写给 10 年 PHP 架构师的教材变成可交互的 HTML 学堂：对照、实验、自测、进度。')}
<body class="home-page">
${bgLayers()}
${topbar('')}
<main class="home">
  <section class="hero">
    <div class="hero-copy">
      <div class="hero-kicker"><span class="dot"></span>elephant-learn · 离线可用 · 无需服务器</div>
      <h1>你已经会了 <em>HTTP、ORM、DI、事务</em>。<br>缺的只是<span class="hl">另一套运行时直觉</span>。</h1>
      <p class="hero-lead">这里把仓库里的 <b>${totalChapters}</b> 章教材（约 <b>${Math.round(totalMin / 60)}</b> 小时阅读量）全部转成 HTML：
      每一段 PHP 写法都和目标语言并排对照，每一个「PHP 直觉会失效的地方」都配一个能动手的实验台。
      配套代码点一下就展开，自测题当场判分，进度和笔记存在本机。</p>
      <div class="hero-actions">
        <a class="btn primary" href="typescript.html">从 TypeScript 开始<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <a class="btn ghost" href="labs/index.html">先看实验台</a>
        <button class="btn ghost" id="heroSearch" type="button">搜索教材 <kbd>Ctrl K</kbd></button>
      </div>
      <div class="hero-stats">
        <div><b>${totalChapters}</b><span>章教材</span></div>
        <div><b>6</b><span>技术栈</span></div>
        <div><b>${codeFiles}</b><span>个配套代码文件</span></div>
        <div><b>5</b><span>个交互实验台</span></div>
      </div>
    </div>
    <div class="hero-visual" aria-hidden="true">
      <div class="hv-card php">
        <div class="hv-head"><span class="hv-dot"></span>PHP-FPM · share-nothing</div>
        <pre><code><span class="t-com">// 每个请求：框架重启一次</span>
<span class="t-kw">public function</span> <span class="t-fn">handle</span>(<span class="t-typ">Request</span> <span class="t-var">$r</span>) {
  <span class="t-var">$balance</span> = <span class="t-typ">Cache</span>::<span class="t-fn">get</span>(<span class="t-str">'balance'</span>);
  <span class="t-kw">if</span> (<span class="t-var">$amount</span> &gt; <span class="t-var">$balance</span>) <span class="t-kw">throw</span> ...;
  <span class="t-var">$balance</span> -= <span class="t-var">$amount</span>;   <span class="t-com">// 请求结束即释放</span>
}</code></pre>
        <div class="hv-foot">进程隔离 · 阻塞只影响一个 worker</div>
      </div>
      <div class="hv-arrow"><svg viewBox="0 0 60 24"><path d="M2 12h50M46 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>换脑子</span></div>
      <div class="hv-card node">
        <div class="hv-head"><span class="hv-dot"></span>Node · 常驻单线程</div>
        <pre><code><span class="t-kw">let</span> sharedBalance = <span class="t-num">100</span>;  <span class="t-com">// 进程级！</span>
<span class="t-kw">export async function</span> <span class="t-fn">withdraw</span>(amount: <span class="t-typ">number</span>) {
  <span class="t-kw">if</span> (amount &gt; sharedBalance) <span class="t-kw">throw</span> ...;
  <span class="t-kw">await</span> <span class="t-typ">Promise</span>.<span class="t-fn">resolve</span>();  <span class="t-com">// 让出点</span>
  sharedBalance -= amount;
}</code></pre>
        <div class="hv-foot warn">并发两次 withdraw(60) → [40, -20]</div>
      </div>
    </div>
  </section>

  <section class="tracks" id="tracks">
    <div class="sec-head"><h2>六套教材</h2><p>按「PHP 直觉失效的密度」排序，不是按语言热度。</p></div>
    <div class="track-grid">${cards}</div>
  </section>

  <section class="labs" id="labs">
    <div class="sec-head"><h2>交互实验台</h2><p>读十遍不如亲手跑一遍。每个实验台都能改参数、看真实结果。</p></div>
    <div class="lab-grid">${labCards}</div>
  </section>

  <section class="method">
    <div class="sec-head"><h2>怎么用这套学堂</h2><p>给已经有十年 PHP 架构经验的人，不是给初学者。</p></div>
    <div class="method-grid">
      <div class="m-card"><span class="m-n">01</span><h4>先做映射，别重学</h4><p>HTTP、REST、ORM、DI、事务、缓存、队列你已经懂了。教材里这些只做对照映射，一眼扫过即可。真正要停下来的是<b>运行模型</b>和<b>类型系统</b>。</p></div>
      <div class="m-card"><span class="m-n">02</span><h4>把「反直觉」当成清单</h4><p>每章末尾的「一句话对照表」和自测题，就是 PHP 直觉失效点的清单。答不上来的那一条，回到对应实验台跑一遍。</p></div>
      <div class="m-card"><span class="m-n">03</span><h4>对照着读三套代码</h4><p>java / python / typescript 的 shop-api 是<b>同一套业务</b>：同样的接口、同样的演示账号、同样的 409 problem+json、同样的乐观锁。差异只可能来自语言本身。</p></div>
      <div class="m-card"><span class="m-n">04</span><h4>笔记写给三个月后的自己</h4><p>每章右下角「写笔记」，存在本机浏览器里，可一键导出 Markdown。用自己的话复述一遍，才算真的学会。</p></div>
    </div>
  </section>

  <footer class="foot">
    <div class="foot-inner">
      <div><b>大象学堂</b><p>由仓库 Markdown 教材生成 · 内容源：<code>typescript/</code> <code>python/</code> <code>java/</code> <code>ack-k8s/</code> <code>security/</code> <code>project-communication/</code></p></div>
      <div class="foot-links"><a href="labs/index.html">实验台</a><a href="labs/cheatsheet.html">速查表</a><a href="typescript.html">TypeScript</a><a href="ack-k8s.html">ACK / K8s</a></div>
    </div>
  </footer>
</main>
${codeDrawer()}
${searchModal()}
${scripts('', data)}
</body></html>`;
}

/* ---------- 实验台索引 ---------- */
function labsIndex() {
  const items = [
    { href: 'event-loop.html', name: '事件循环实验台', accent: '#4C9AFF', track: 'typescript', ch: '03-JS运行时与事件循环', desc: '调用栈 / 微任务 / 宏任务逐帧动画，8 个真实 snippet，顺序由 Node 实测生成。', controls: '播放速度 · 单步 · 代码编辑 · 队列高亮 · 自动播放 · 重置 · 导出 trace' },
    { href: 'k8s-port.html', name: '港口调度模拟器', accent: '#37D6FF', track: 'ack-k8s', ch: '05-期望状态-自愈扩容与更新', desc: '声明式期望状态驱动的集装箱港口：自愈、滚动更新、HPA、节点故障、PDB。', controls: '副本数 · 镜像版本 · 更新策略 ·  chaos · HPA 阈值 · 节点数 · 速度 · 网格 · 重置' },
    { href: 'type-boundary.html', name: '类型擦除与边界校验', accent: '#F7DF1E', track: 'typescript', ch: '05-运行时校验与边界', desc: '同一份脏 JSON，TS 类型沉默、Zod 拦截。可编辑 payload，实时看校验结果与 problem+json。', controls: 'payload 编辑 · schema 切换 · 严格模式 · 默认值 · 品牌类型 · 金额精度 · 重置' },
    { href: 'request-lifecycle.html', name: '一个请求的生命周期', accent: '#FF7AB8', track: 'typescript', ch: '07-NestJS-Web与REST', desc: 'NestJS 请求管线逐站点亮，认证 / 校验 / 库存 / 乐观锁分支产生真实状态码。', controls: '认证开关 · 角色 · 请求体 · 库存 · 并发 · 慢查询 · 日志级别 · 重置' },
    { href: 'cheatsheet.html', name: 'PHP → X 速查表', accent: '#37E39B', track: 'all', ch: '', desc: '六套教材附录合并，按语言 / 分类 / 关键词即时过滤，支持「只看坑」。', controls: '语言切换 · 分类 · 关键词 · 只看坑 · 紧凑模式 · 复制 · 导出' }
  ];
  const cards = items.map((l) => `<a class="lab-card big" href="${l.href}" style="--ta:${l.accent}">
    <span class="lc-tag">${escapeHtml(l.track === 'all' ? '全部教材' : l.track)}</span>
    <h4>${escapeHtml(l.name)}</h4><p>${escapeHtml(l.desc)}</p>
    <div class="lc-controls">${escapeHtml(l.controls)}</div>
    <span class="lc-track">打开实验台 →</span></a>`).join('');
  return `${head('交互实验台 · 大象学堂', '事件循环、K8s 调度、类型边界、请求生命周期、速查表')}
<body class="labs-page">
${bgLayers()}
${topbar('')}
<main class="home">
  <section class="hero small">
    <div class="hero-copy">
      <div class="hero-kicker"><span class="dot"></span>LABS · 动手比阅读快十倍</div>
      <h1>五个<span class="hl">能动手</span>的实验台</h1>
      <p class="hero-lead">每个实验台都对应教材里最难靠阅读建立直觉的一节。参数常驻可见，改一下立刻生效；所有结果要么由真实运行时产生，要么与仓库代码逐字段对齐。</p>
    </div>
  </section>
  <section class="labs"><div class="lab-grid wide">${cards}</div></section>
  <footer class="foot"><div class="foot-inner"><div><b>大象学堂</b><p>实验台与教材章节双向跳转，进度与笔记本机保存。</p></div><div class="foot-links"><a href="index.html">学习中心</a><a href="typescript.html">TypeScript</a><a href="ack-k8s.html">ACK / K8s</a></div></div></footer>
</main>
${codeDrawer()}
${searchModal()}
${scripts('../', { kind: 'labs' })}
</body></html>`;
}

/* ---------- 实验台数据：事件循环 trace（构建期真实校验） ---------- */
import { SNIPPETS, verify as verifyEL } from './labs-src/event-loop-data.mjs';
const elVerify = await verifyEL();
fs.mkdirSync(path.join(OUT, 'assets', 'labs'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets', 'labs', 'event-loop-data.js'),
  'window.__EL_DATA__=' + JSON.stringify({ snippets: SNIPPETS, verify: elVerify }) + ';\n');

/* ---------- 实验台数据：速查表（从各附录表格抽取） ---------- */
import { inline as mdInline } from './lib/markdown.mjs';
const csRows = [];
for (const t of TRACKS) {
  const app = chapters.filter((c) => c.track === t.id && /附录|概念对照表/.test(c.base));
  for (const ch of app) {
    const lines = ch.raw.split('\n');
    let cat = '总表';
    let inTable = false, head = null;
    const ctx = { file: ch.file, resolveLink, codeRefs: new Set(), slug: (s) => slugify(s) };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const hm = /^##\s+(.*)$/.exec(ln);
      if (hm) { cat = hm[1].replace(/[*`]/g, '').trim(); inTable = false; head = null; continue; }
      if (/^###\s+/.test(ln)) { cat = ln.replace(/^###\s+/, '').replace(/[*`]/g, '').trim(); inTable = false; head = null; continue; }
      if (ln.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        head = ln.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
        inTable = true; i++; continue;
      }
      if (inTable && ln.trim().startsWith('|')) {
        const cells = ln.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((x) => x.trim().replace(/\\\|/g, '|'));
        if (cells.length < 2) continue;
        const isPhp = /PHP|Laravel/i.test(head[0] || '');
        const php = cells[0], target = cells[1] || '';
        const note = isPhp ? (cells[2] || '') : (cells[3] || cells[2] || '');
        const extra = !isPhp && cells[2] ? '（' + cells[2] + '）' : '';
        const pit = /坑|不等价|失效|语义不|别|不要|警告|注意|⚠|翻车|bug|Bug|不像|不成立/.test(note) && !/^—$/.test(note.trim());
        csRows.push({
          t: t.id, cat,
          php: mdInline(php, ctx), target: mdInline(target, ctx),
          note: mdInline(note + extra, ctx), pit: !!pit,
          raw: [php, target, note].join(' | ').replace(/<[^>]+>/g, '')
        });
        continue;
      }
      if (inTable && !ln.trim()) { inTable = false; head = null; }
    }
  }
}
fs.writeFileSync(path.join(OUT, 'assets', 'labs', 'cheatsheet-data.js'), 'window.__CS_DATA__=' + JSON.stringify(csRows) + ';\n');

/* ---------- 实验台页面 ---------- */
const LAB_SRC = path.join(HERE, 'labs-src');
const labMetas = [];
if (fs.existsSync(LAB_SRC)) {
  for (const f of fs.readdirSync(LAB_SRC).filter((x) => x.endsWith('.html'))) {
    const raw = fs.readFileSync(path.join(LAB_SRC, f), 'utf8');
    const mm = /^<!--LAB\s*([\s\S]*?)-->\s*/.exec(raw);
    if (!mm) { console.warn('  [lab] 缺少 meta:', f); continue; }
    const meta = JSON.parse(mm[1]);
    const body = raw.slice(mm[0].length);
    labMetas.push(meta);
    const deps = (meta.deps || []).map((d) => `<script src="../assets/labs/${d}"></script>`).join('\n');
    const html = `${head(meta.title + ' · 大象学堂', meta.lead, '../', ['labs.css'])}
<body class="lab-page" data-track="${meta.track}" style="--ta:${meta.accent};--ta2:${meta.accent2}">
${bgLayers()}
${topbar(meta.track, '../')}
${body}
${codeDrawer('../')}
${searchModal('../')}
<script>window.__PAGE__=${JSON.stringify({ kind: 'lab', track: meta.track, name: meta.title })};</script>
<script src="../assets/highlight.js"></script>
${deps}
<script src="../assets/app.js"></script>
${(meta.js || []).map((j) => `<script src="../assets/labs/${j}"></script>`).join('\n')}
</body></html>`;
    fs.writeFileSync(path.join(OUT, 'labs', meta.id + '.html'), html);
  }
}

/* ---------- 输出 ---------- */
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), indexPage());
for (const t of TRACKS) fs.writeFileSync(path.join(OUT, t.id + '.html'), trackPage(t));
fs.mkdirSync(path.join(OUT, 'labs'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'labs', 'index.html'), labsIndex());

const stats = { chapters: chapters.length, minutes: chapters.reduce((s, c) => s + c.minutes, 0), codeFiles, codeKB: Math.round(codeBytes / 1024), deep: deepCount };
fs.writeFileSync(path.join(OUT, 'assets', 'build-stats.json'), JSON.stringify(stats, null, 2));
console.log('构建完成:', JSON.stringify(stats));
for (const t of TRACKS) {
  const chs = chapters.filter((c) => c.track === t.id);
  console.log(`  ${t.id.padEnd(24)} ${String(chs.length).padStart(3)} 章  ${String(chs.reduce((s, c) => s + c.minutes, 0)).padStart(4)} 分钟`);
}