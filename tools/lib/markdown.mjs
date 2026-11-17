import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HL = require('../../html/assets/highlight.js');

const ALLOWED_RAW = new Set(['details', 'summary', 'br']);

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- 行内 ---------- */
const INLINE_RE = new RegExp(
  [
    '(`+)([\\s\\S]*?)\\1',                                  // 1,2 code
    '\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"([^"]*)")?\\)',      // 3,4,5 link
    '<((?:https?|mailto):[^>\\s]+)>',                        // 6 autolink
    '\\*\\*\\*([\\s\\S]+?)\\*\\*\\*',                        // 7 bold italic
    '\\*\\*([\\s\\S]+?)\\*\\*',                              // 8 bold
    '__([\\s\\S]+?)__',                                      // 9 bold
    '~~([\\s\\S]+?)~~',                                      // 10 strike
    '(?<![\\w*])\\*([^*\\n]+?)\\*(?![\\w*])',                 // 11 em
    '(?<![\\w_])_([^_\\n]+?)_(?![\\w_])',                    // 12 em
    '(<br\\s*/?>)',                                          // 13 br
    '(&(?:#\\d+|[a-zA-Z]+);)',                               // 14 entity
    '<details>\\s*<summary>([\\s\\S]*?)</summary>([\\s\\S]*?)</details>' // 15,16 行内折叠
  ].join('|'),
  'g'
);

export function inline(raw, ctx) {
  const text = String(raw == null ? '' : raw);
  let out = '';
  let last = 0;
  const re = new RegExp(INLINE_RE.source, 'g');
  let m;
  while ((m = re.exec(text))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += escapeHtml(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      let code = m[2];
      if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
      out += '<code class="ic">' + escapeHtml(code) + '</code>';
    } else if (m[3] !== undefined) {
      out += renderLink(m[3], m[4], ctx);
    } else if (m[6] !== undefined) {
      out += '<a class="ext" href="' + escapeHtml(m[6]) + '" target="_blank" rel="noreferrer noopener">' + escapeHtml(m[6].replace(/^mailto:/, '')) + '</a>';
    } else if (m[7] !== undefined) {
      out += '<strong><em>' + inline(m[7], ctx) + '</em></strong>';
    } else if (m[8] !== undefined || m[9] !== undefined) {
      out += '<strong>' + inline(m[8] !== undefined ? m[8] : m[9], ctx) + '</strong>';
    } else if (m[10] !== undefined) {
      out += '<del>' + inline(m[10], ctx) + '</del>';
    } else if (m[11] !== undefined || m[12] !== undefined) {
      out += '<em>' + inline(m[11] !== undefined ? m[11] : m[12], ctx) + '</em>';
    } else if (m[13] !== undefined) {
      out += '<br>';
    } else if (m[15] !== undefined) {
      out += inlineReveal(m[15], m[16], ctx);
    } else {
      out += m[0];
    }
  }
  out += escapeHtml(text.slice(last));
  return out;
}

const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function inlineReveal(summary, body, ctx) {
  return '<span class="reveal inline"><button class="reveal-btn" type="button" aria-expanded="false">' +
    '<span class="reveal-ico" aria-hidden="true">' + CHEVRON + '</span>' +
    '<span class="reveal-title">' + inline(summary, ctx) + '</span></button>' +
    '<span class="reveal-panel" hidden>' + inline(body.trim(), ctx) + '</span></span>';
}

function renderLink(label, href, ctx) {
  const resolved = ctx.resolveLink ? ctx.resolveLink(href, ctx.file) : { kind: 'external', href };
  const inner = inline(label, ctx);
  if (resolved.kind === 'doc') {
    return '<a class="xref" href="' + escapeHtml(resolved.href) + '" data-doc="' + escapeHtml(resolved.target || '') + '">' + inner + '</a>';
  }
  if (resolved.kind === 'code') {
    ctx.codeRefs && ctx.codeRefs.add(resolved.path);
    return '<a class="coderef" href="#code" data-code="' + escapeHtml(resolved.path) + '" title="查看配套代码：' + escapeHtml(resolved.path) + '">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5 2 8l3.5 4.5M10.5 3.5 14 8l-3.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      inner + '</a>';
  }
  if (resolved.kind === 'anchor') {
    return '<a class="xref" href="' + escapeHtml(resolved.href) + '">' + inner + '</a>';
  }
  if (resolved.kind === 'missing') {
    return '<span class="missing-ref" title="构建产物或仓库外文件：' + escapeHtml(href) + '">' + inner + '</span>';
  }
  return '<a class="ext" href="' + escapeHtml(resolved.href) + '" target="_blank" rel="noreferrer noopener">' + inner + '</a>';
}

/* ---------- 块级 ---------- */
const RE = {
  fence: /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)\s*(.*)$/,
  heading: /^(\s{0,3})(#{1,6})\s+(.+?)\s*#*\s*$/,
  hr: /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/,
  quote: /^\s{0,3}>/,
  item: /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/,
  html: /^\s*<\/?([a-zA-Z][a-zA-Z0-9-]*)/
};

function indentOf(line) { const m = /^[ \t]*/.exec(line); return m[0].replace(/\t/g, '    ').length; }
function isBlank(line) { return !line || !line.trim(); }

function splitRow(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export function renderBlocks(lines, ctx, depth = 0) {
  let html = '';
  let i = 0;
  const n = lines.length;
  if (depth > 12) return '<p>' + inline(lines.join(' '), ctx) + '</p>';

  while (i < n) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    // 围栏代码
    let m = RE.fence.exec(line);
    if (m) {
      const marker = m[2][0];
      const len = m[2].length;
      const lang = m[3] || '';
      const body = [];
      i++;
      while (i < n) {
        const close = new RegExp('^\\s{0,3}' + (marker === '`' ? '`' : '~') + '{' + len + ',}\\s*$');
        if (close.test(lines[i])) { i++; break; }
        body.push(lines[i]); i++;
      }
      html += renderCode(body.join('\n'), lang, ctx);
      continue;
    }

    // 标题
    m = RE.heading.exec(line);
    if (m) {
      const level = m[2].length;
      const text = m[3];
      const id = ctx.slug(text);
      if (level <= 3) ctx.toc.push({ level, id, text: text.replace(/[*`_]/g, '') });
      html += `<h${level} id="${id}" class="md-h"><a class="anchor" href="#${id}" aria-label="锚点">#</a>${inline(text, ctx)}</h${level}>`;
      i++; continue;
    }

    // 分隔线
    if (RE.hr.test(line)) { html += '<hr class="md-hr">'; i++; continue; }

    // 引用
    if (RE.quote.test(line)) {
      const buf = [];
      while (i < n && (RE.quote.test(lines[i]) || (!isBlank(lines[i]) && buf.length && !RE.fence.test(lines[i]) && !RE.heading.test(lines[i])))) {
        buf.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++;
      }
      const inner = renderBlocks(buf, ctx, depth + 1);
      const first = buf.find((b) => b.trim()) || '';
      let variant = 'note';
      if (/^\s*\*\*(坑|注意|警告|危险|陷阱|别|不要)/.test(first) || /(坑|陷阱|警告|危险)/.test(first.slice(0, 24))) variant = 'warn';
      else if (/^\s*\*\*(真相|大人|结论|记住|心法|重点)/.test(first) || /(真相|心法|重点)/.test(first.slice(0, 24))) variant = 'key';
      else if (/(PHP|php)/.test(first.slice(0, 40))) variant = 'php';
      html += `<aside class="callout ${variant}"><div class="callout-mark" aria-hidden="true"></div><div class="callout-body">${inner}</div></aside>`;
      continue;
    }

    // 表格
    if (line.includes('|') && i + 1 < n && RE.tableSep.test(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(':'), r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
      });
      i += 2;
      const rows = [];
      while (i < n && lines[i].includes('|') && !isBlank(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      const isCmp = head.some((h) => /PHP|Laravel|php/i.test(h)) && head.length >= 2;
      html += '<div class="table-wrap' + (isCmp ? ' cmp' : '') + '"><table class="md-table"><thead><tr>';
      head.forEach((h, k) => { html += `<th${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(h, ctx)}</th>`; });
      html += '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>';
        for (let k = 0; k < head.length; k++) {
          html += `<td${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(r[k] || '', ctx)}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      continue;
    }

    // 列表
    m = RE.item.exec(line);
    if (m) {
      const base = indentOf(line);
      const ordered = /\d/.test(m[2][0]);
      const start = ordered ? parseInt(m[2], 10) : 1;
      const items = [];
      let cur = null;
      let loose = false;
      let pendingBlank = false;
      while (i < n) {
        const ln = lines[i];
        if (isBlank(ln)) { pendingBlank = true; i++; continue; }
        const im = RE.item.exec(ln);
        const ind = indentOf(ln);
        if (im && ind <= base + 1) {
          if (ind < base) break;
          if (pendingBlank && cur) loose = true;
          pendingBlank = false;
          cur = { lines: [im[3]], marker: im[2] };
          items.push(cur);
          i++; continue;
        }
        if (cur && ind > base) {
          if (pendingBlank) { loose = true; cur.lines.push(''); pendingBlank = false; }
          cur.lines.push(ln.slice(Math.min(ind, base + 2)));
          i++; continue;
        }
        if (cur && !pendingBlank && !RE.heading.test(ln) && !RE.fence.test(ln) && !RE.hr.test(ln) && ind >= base) {
          cur.lines.push(ln.trim()); i++; continue;
        }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      const isTask = items.some((it) => /^\[[ xX]\]\s/.test(it.lines[0]));
      html += `<${tag} class="md-list${isTask ? ' task-list' : ''}${loose ? ' loose' : ''}"${ordered && start !== 1 ? ` start="${start}"` : ''}>`;
      for (const it of items) {
        let first = it.lines[0];
        let taskAttr = '', box = '';
        const tm = /^\[([ xX])\]\s+(.*)$/.exec(first);
        if (tm) {
          const checked = tm[1].toLowerCase() === 'x';
          const tid = ctx.slug(ctx.file + ':' + first.slice(0, 60));
          taskAttr = ` data-task="${tid}"`;
          box = `<button class="task-box${checked ? ' on' : ''}" role="checkbox" aria-checked="${checked}" data-task="${tid}" aria-label="切换完成状态"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
          it.lines[0] = tm[2];
        }
        const body = renderBlocks(it.lines, ctx, depth + 1);
        const single = /^<p>[\s\S]*<\/p>$/.test(body) && !body.slice(3, -4).includes('<p>');
        html += `<li${taskAttr}>${box}${single && !loose ? body.slice(3, -4) : body}</li>`;
      }
      html += `</${tag}>`;
      continue;
    }

    // 原生 HTML（白名单）
    m = RE.html.exec(line);
    if (m && ALLOWED_RAW.has(m[1].toLowerCase())) {
      const tag = m[1].toLowerCase();
      if (tag === 'details') {
        const buf = [];
        i++;
        while (i < n && !/^\s*<\/details>/i.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        let title = '展开';
        let inner = buf.join('\n');
        const sm = /<summary>([\s\S]*?)<\/summary>/i.exec(inner);
        if (sm) { title = sm[1].trim(); inner = inner.replace(sm[0], ''); }
        const id = ctx.slug('reveal-' + title + '-' + i);
        html += `<div class="reveal" data-reveal="${id}"><button class="reveal-btn" type="button" aria-expanded="false" aria-controls="${id}">` +
          `<span class="reveal-ico" aria-hidden="true">${CHEVRON}</span>` +
          `<span class="reveal-title">${inline(title, ctx)}</span><span class="reveal-hint">点击展开</span></button>` +
          `<div class="reveal-panel" id="${id}" hidden>${renderBlocks(inner.split('\n'), ctx, depth + 1)}</div></div>`;
        continue;
      }
      if (tag === 'br') { html += '<br>'; i++; continue; }
      i++; continue;
    }
    if (m) { // 非白名单标签：当普通文本
      html += '<p>' + inline(line, ctx) + '</p>'; i++; continue;
    }

    // 段落
    const buf = [line];
    i++;
    while (i < n && !isBlank(lines[i]) && !RE.fence.test(lines[i]) && !RE.heading.test(lines[i]) &&
      !RE.hr.test(lines[i]) && !RE.quote.test(lines[i]) && !RE.item.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < n && RE.tableSep.test(lines[i + 1])) &&
      !(RE.html.test(lines[i]) && ALLOWED_RAW.has((RE.html.exec(lines[i]) || [])[1]?.toLowerCase()))) {
      buf.push(lines[i]); i++;
    }
    const text = buf.join('\n');
    const para = inline(text, ctx).replace(/\n/g, '<br>\n');
    const isLead = depth === 0 && /^<strong>/.test(para) === false && ctx.paraCount === 0;
    ctx.paraCount = (ctx.paraCount || 0) + 1;
    html += `<p class="md-p${isLead ? ' lead' : ''}">${para}</p>`;
  }
  return html;
}

function renderCode(code, lang, ctx) {
  const norm = HL.normalize(lang);
  const isDiagram = !lang && /[─│┌┐└┘├┤┬┴┼▲▼►◄━┃╔╗╚╝║═]/.test(code);
  const lines = code.split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const body = lines.join('\n');
  const id = 'c' + (ctx.codeSeq = (ctx.codeSeq || 0) + 1);
  const label = isDiagram ? '示意图' : HL.label(lang || 'text');
  const numbered = !isDiagram && lines.length > 3 && norm !== 'text';
  const gut = numbered
    ? '<span class="gutter" aria-hidden="true">' + lines.map((_, k) => '<i>' + (k + 1) + '</i>').join('') + '</span>'
    : '';
  ctx.codeBlocks = (ctx.codeBlocks || 0) + 1;
  return `<figure class="code${isDiagram ? ' diagram' : ''}" data-lang="${norm}">` +
    `<figcaption><span class="code-lang">${escapeHtml(label)}</span>` +
    `<span class="code-meta">${lines.length} 行</span>` +
    `<button class="code-copy" data-copy="${id}" type="button" aria-label="复制代码">` +
    `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.5H3.6a1.1 1.1 0 0 0-1.1 1.1v6.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>` +
    `<span>复制</span></button></figcaption>` +
    `<div class="code-body"><pre id="${id}" class="${numbered ? 'numbered' : ''}">${gut}<code>${HL.highlight(body, lang)}</code></pre></div>` +
    `</figure>`;
}

export function renderDocument(md, ctx) {
  ctx.toc = [];
  ctx.paraCount = 0;
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  // 去掉首个 H1（页面头部单独渲染）
  let title = '';
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    const m = RE.heading.exec(lines[i]);
    if (m && m[2].length === 1) { title = m[3]; start = i + 1; }
    break;
  }
  const html = renderBlocks(lines.slice(start), ctx);
  return { title, html, toc: ctx.toc };
}