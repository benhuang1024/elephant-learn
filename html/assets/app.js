/* 大象学堂 · 站点外壳：路由 / 进度 / 搜索 / 代码抽屉 / 笔记 / 音效 / 主题 */
(function () {
  'use strict';
  var PAGE = window.__PAGE__ || { kind: 'home' };
  var DEPTH = /\/labs\//.test(location.pathname) ? '../' : '';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 存储 ---------- */
  var mem = {};
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('el.' + k); return v === null ? (k in mem ? mem[k] : d) : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : d; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { localStorage.setItem('el.' + k, JSON.stringify(v)); } catch (e) { /* file:// 隐私模式 */ }
    },
    del: function (k) { delete mem[k]; try { localStorage.removeItem('el.' + k); } catch (e) {} }
  };

  /* ---------- 音效 ---------- */
  var Sound = {
    ctx: null, on: store.get('sound', true),
    ensure: function () {
      if (!this.on) return null;
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { this.ctx = new AC(); } catch (e) { return null; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    play: function (type) {
      var ctx = this.ensure(); if (!ctx) return;
      var t = ctx.currentTime;
      var spec = {
        tick: [[880, 0.035, 'sine', 0.05]],
        step: [[520, 0.05, 'triangle', 0.055]],
        open: [[420, 0.07, 'sine', 0.05], [640, 0.09, 'sine', 0.04]],
        close: [[520, 0.06, 'sine', 0.04], [330, 0.08, 'sine', 0.035]],
        ok: [[660, 0.07, 'sine', 0.05], [990, 0.12, 'sine', 0.045]],
        err: [[180, 0.16, 'sawtooth', 0.035]],
        pop: [[1200, 0.03, 'square', 0.022]],
        done: [[523, 0.08, 'sine', 0.05], [784, 0.09, 'sine', 0.045], [1046, 0.16, 'sine', 0.04]]
      }[type] || [[600, 0.05, 'sine', 0.04]];
      spec.forEach(function (s, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = s[2]; o.frequency.value = s[0];
        var start = t + i * 0.055;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(s[3], start + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, start + s[1]);
        o.connect(g); g.connect(ctx.destination);
        o.start(start); o.stop(start + s[1] + 0.03);
      });
    }
  };
  window.ELSound = Sound;

  /* ---------- 提示 ---------- */
  var toastWrap = document.createElement('div');
  toastWrap.className = 'toast-wrap';
  document.body.appendChild(toastWrap);
  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 320); }, 2200);
  }
  window.ELToast = toast;

  /* ---------- 主题 ---------- */
  var theme = store.get('theme', 'dark');
  document.documentElement.setAttribute('data-theme', theme);
  var themeBtn = $('#themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    store.set('theme', theme);
    Sound.play('open');
  });

  /* ---------- 音效开关 ---------- */
  var soundBtn = $('#soundToggle');
  function paintSound() {
    if (!soundBtn) return;
    soundBtn.setAttribute('aria-pressed', String(Sound.on));
    soundBtn.title = '音效：' + (Sound.on ? '开' : '关');
  }
  paintSound();
  if (soundBtn) soundBtn.addEventListener('click', function () {
    Sound.on = !Sound.on; store.set('sound', Sound.on); paintSound();
    if (Sound.on) Sound.play('ok');
    toast(Sound.on ? '音效已开启' : '音效已静音');
  });

  /* ---------- 顶栏滚动状态 ---------- */
  var topbar = $('#topbar');
  var readBar = $('#readProgress i');
  function onScrollGlobal() {
    if (topbar) topbar.classList.toggle('scrolled', window.scrollY > 8);
    if (PAGE.kind === 'track') updateSpy();
  }
  window.addEventListener('scroll', onScrollGlobal, { passive: true });

  /* ---------- 进度 ---------- */
  function progressKey(t) { return 'read.' + t; }
  function getRead(t) { return store.get(progressKey(t), {}); }
  function setRead(t, id, val) {
    var m = getRead(t);
    if (val) m[id] = Date.now(); else delete m[id];
    store.set(progressKey(t), m);
    paintProgress();
  }
  function paintProgress() {
    if (PAGE.kind === 'track') {
      var read = getRead(PAGE.track);
      var total = PAGE.chapters.length;
      var done = PAGE.chapters.filter(function (c) { return read[c.id]; }).length;
      var pct = total ? Math.round(done / total * 100) : 0;
      var bar = $('#sbBar'), pctEl = $('#sbPct');
      if (bar) bar.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      $$('.sb-item').forEach(function (a) { a.classList.toggle('done', !!read[a.dataset.chapter]); });
      var mr = $('.chapter:not([hidden]) .mark-read');
      if (mr) {
        var on = !!read[mr.dataset.chapter];
        mr.classList.toggle('on', on);
        $('.mr-text', mr).textContent = on ? '已读' : '标记已读';
      }
      store.set('last.' + PAGE.track, currentId);
    }
    if (PAGE.kind === 'home') {
      PAGE.tracks.forEach(function (t) {
        var read = getRead(t.id);
        var done = t.chapters.filter(function (id) { return read[id]; }).length;
        var pct = t.chapters.length ? Math.round(done / t.chapters.length * 100) : 0;
        var bar = $('[data-track-bar="' + t.id + '"]');
        var lab = $('[data-track-pct="' + t.id + '"]');
        if (bar) bar.style.width = pct + '%';
        if (lab) lab.textContent = pct ? '已读 ' + pct + '%' : '未开始';
      });
    }
  }

  /* ---------- 章节路由 ---------- */
  var currentId = null;
  function chapterIds() { return (PAGE.chapters || []).map(function (c) { return c.id; }); }
  function findChapter(hash) {
    var ids = chapterIds();
    if (!hash) return null;
    if (ids.indexOf(hash) >= 0) return { id: hash, anchor: null };
    var i = hash.indexOf('--');
    if (i > 0) {
      var base = hash.slice(0, i);
      if (ids.indexOf(base) >= 0) return { id: base, anchor: hash };
    }
    return null;
  }
  function showChapter(id, anchor, push) {
    var arts = $$('.chapter');
    var target = null;
    arts.forEach(function (a) {
      var on = a.dataset.chapter === id;
      a.hidden = !on;
      if (on) target = a;
    });
    if (!target) return false;
    currentId = id;
    $$('.sb-item').forEach(function (a) {
      var on = a.dataset.chapter === id;
      a.classList.toggle('active', on);
      if (on && window.innerWidth <= 900) closeSidebar();
    });
    var meta = PAGE.chapters.filter(function (c) { return c.id === id; })[0];
    document.title = (meta ? meta.title.replace(/^\d+[-\s]*/, '') : id) + ' · ' + PAGE.name + ' · 大象学堂';
    buildToc(target);
    paintProgress();
    paintNotes(target);
    if (push !== false) {
      var h = '#' + (anchor || id);
      if (location.hash !== h) history.replaceState(null, '', h);
    }
    if (anchor) {
      var el = document.getElementById(anchor);
      if (el) { requestAnimationFrame(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); return true; }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    return true;
  }
  function buildToc(art) {
    var box = $('#tocScroll'); if (!box) return;
    var data = $('.ch-toc-data', art);
    box.innerHTML = data ? data.innerHTML : '';
    $$('.toc-l', box).forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var el = document.getElementById(a.dataset.target);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          history.replaceState(null, '', '#' + a.dataset.target);
        }
      });
    });
    updateSpy();
  }
  function updateSpy() {
    if (PAGE.kind !== 'track') {
      if (readBar) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        readBar.style.width = (h > 0 ? Math.min(100, window.scrollY / h * 100) : 0) + '%';
      }
      return;
    }
    var art = $('.chapter:not([hidden])'); if (!art) return;
    var heads = $$('.md-h, .deep-head h2', art);
    var line = window.scrollY + parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) + 60;
    var active = null;
    heads.forEach(function (h) { if (h.offsetTop <= line) active = h; });
    $$('.toc-l').forEach(function (a) { a.classList.toggle('active', !!active && a.dataset.target === active.id); });
    var start = art.offsetTop, end = start + art.offsetHeight;
    var pct = end > start ? (window.scrollY + window.innerHeight - start) / (end - start) * 100 : 0;
    if (readBar) readBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (pct >= 99 && currentId && !getRead(PAGE.track)[currentId]) {
      setRead(PAGE.track, currentId, true);
    }
  }
  function route() {
    if (PAGE.kind !== 'track') return;
    var hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    var f = findChapter(hash);
    if (f) { showChapter(f.id, f.anchor, false); return; }
    var last = store.get('last.' + PAGE.track, null);
    var ids = chapterIds();
    showChapter(last && ids.indexOf(last) >= 0 ? last : ids[0], null, false);
  }
  window.addEventListener('hashchange', route);

  /* ---------- 侧栏（移动端） ---------- */
  var sidebar = $('#sidebar'), sbScrim = $('#sbScrim'), menuBtn = $('#menuToggle');
  function openSidebar() { if (!sidebar) return; sidebar.classList.add('open'); if (sbScrim) sbScrim.hidden = false; if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true'); }
  function closeSidebar() { if (!sidebar) return; sidebar.classList.remove('open'); if (sbScrim) sbScrim.hidden = true; if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false'); }
  if (menuBtn) menuBtn.addEventListener('click', function () { sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); Sound.play('open'); });
  if (sbScrim) sbScrim.addEventListener('click', closeSidebar);

  /* ---------- 全局点击委托 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;

    var copy = t.closest && t.closest('.code-copy');
    if (copy) {
      var pre = document.getElementById(copy.dataset.copy);
      var code = pre ? $('code', pre) : null;
      if (code) {
        copyText(code.textContent).then(function () {
          copy.classList.add('ok');
          var span = $('span:last-child', copy);
          var old = span.textContent; span.textContent = '已复制';
          Sound.play('ok');
          setTimeout(function () { copy.classList.remove('ok'); span.textContent = old; }, 1600);
        });
      }
      return;
    }

    var rv = t.closest && t.closest('.reveal-btn');
    if (rv) {
      var wrap = rv.closest('.reveal');
      var panel = $('.reveal-panel', wrap);
      var open = rv.getAttribute('aria-expanded') === 'true';
      rv.setAttribute('aria-expanded', String(!open));
      if (panel) panel.hidden = open;
      Sound.play(open ? 'close' : 'open');
      return;
    }

    var tb = t.closest && t.closest('.task-box');
    if (tb) {
      var on = !tb.classList.contains('on');
      tb.classList.toggle('on', on);
      tb.setAttribute('aria-checked', String(on));
      var li = tb.closest('li'); if (li) li.classList.toggle('done', on);
      var tasks = store.get('tasks', {});
      if (on) tasks[tb.dataset.task] = 1; else delete tasks[tb.dataset.task];
      store.set('tasks', tasks);
      Sound.play(on ? 'ok' : 'tick');
      return;
    }

    var cr = t.closest && t.closest('.coderef');
    if (cr) { e.preventDefault(); openDrawer(cr.dataset.code); return; }

    var mr = t.closest && t.closest('.mark-read');
    if (mr) {
      var now = !getRead(PAGE.track)[mr.dataset.chapter];
      setRead(PAGE.track, mr.dataset.chapter, now);
      Sound.play(now ? 'done' : 'tick');
      toast(now ? '已标记为已读' : '已取消已读标记', now ? 'ok' : '');
      return;
    }

    var no = t.closest && t.closest('.note-open');
    if (no) {
      var zone = $('.note-zone[data-chapter="' + no.dataset.chapter + '"]');
      if (zone) { zone.hidden = !zone.hidden; if (!zone.hidden) { $('.note-input', zone).focus(); Sound.play('open'); } }
      return;
    }

    var ne = t.closest && t.closest('.note-export');
    if (ne) { exportNotes(); return; }

    var sb = t.closest && t.closest('.sb-item');
    if (sb) {
      e.preventDefault();
      var id = sb.dataset.chapter;
      showChapter(id, null, true);
      history.replaceState(null, '', '#' + id);
      Sound.play('step');
      return;
    }

    var pg = t.closest && t.closest('.pg');
    if (pg && pg.getAttribute('href') && pg.getAttribute('href').charAt(0) === '#') {
      e.preventDefault();
      showChapter(pg.getAttribute('href').slice(1), null, true);
      Sound.play('step');
      return;
    }

    if (t.closest && t.closest('[data-close]')) { closeDrawer(); closeSearch(); return; }
    if (t.closest && t.closest('#drawerClose')) { closeDrawer(); return; }
    if (t.closest && t.closest('#drawerCopy')) {
      var codeEl = $('#drawerBody code');
      if (codeEl) copyText(codeEl.textContent).then(function () { toast('已复制全文', 'ok'); Sound.play('ok'); });
      return;
    }
    if (t.closest && t.closest('#searchOpen') || t.closest && t.closest('#heroSearch')) { openSearch(); return; }
    if (t.closest && t.closest('#resumeBtn')) {
      var last = store.get('last.' + PAGE.track, null);
      var ids = chapterIds();
      var read = getRead(PAGE.track);
      var next = ids.filter(function (id) { return !read[id]; })[0] || last || ids[0];
      showChapter(next, null, true);
      toast('继续：' + (PAGE.chapters.filter(function (c) { return c.id === next; })[0] || {}).title, 'ok');
      Sound.play('step');
      return;
    }
    if (t.closest && t.closest('#resetProgress')) {
      if (!confirm('清空本教材的阅读进度、任务勾选与笔记？此操作不可撤销。')) return;
      store.del(progressKey(PAGE.track));
      store.del('last.' + PAGE.track);
      var tasks = store.get('tasks', {});
      $$('.task-box').forEach(function (b) { delete tasks[b.dataset.task]; b.classList.remove('on'); b.setAttribute('aria-checked', 'false'); var li = b.closest('li'); if (li) li.classList.remove('done'); });
      store.set('tasks', tasks);
      $$('.note-input').forEach(function (ta) { store.del('note.' + PAGE.track + '.' + ta.dataset.chapter); ta.value = ''; });
      paintProgress();
      toast('进度已重置', 'warn');
      return;
    }
    var dlf = t.closest && t.closest('.drawer-list a');
    if (dlf) { e.preventDefault(); openDrawer(dlf.dataset.code); return; }
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  /* ---------- 笔记 ---------- */
  function paintNotes(art) {
    $$('.note-input', art).forEach(function (ta) {
      var v = store.get('note.' + PAGE.track + '.' + ta.dataset.chapter, '');
      if (ta.value !== v) ta.value = v;
      var zone = ta.closest('.note-zone');
      if (zone && v) zone.hidden = false;
      var st = $('.note-status', zone);
      if (st) st.textContent = v ? '已保存 ' + v.length + ' 字' : '自动保存到本机浏览器';
    });
  }
  document.addEventListener('input', function (e) {
    var ta = e.target;
    if (!ta.classList || !ta.classList.contains('note-input')) return;
    var key = 'note.' + PAGE.track + '.' + ta.dataset.chapter;
    clearTimeout(ta._t);
    ta._t = setTimeout(function () {
      store.set(key, ta.value);
      var st = $('.note-status', ta.closest('.note-zone'));
      if (st) st.textContent = ta.value ? '已保存 ' + ta.value.length + ' 字' : '自动保存到本机浏览器';
    }, 400);
  });
  function exportNotes() {
    var out = ['# 大象学堂 · 我的笔记', '', '> 导出时间：' + new Date().toLocaleString('zh-CN'), ''];
    var n = 0;
    (PAGE.chapters || []).forEach(function (c) {
      var v = store.get('note.' + PAGE.track + '.' + c.id, '');
      if (!v) return;
      n++;
      out.push('## ' + c.title, '', v, '');
    });
    if (!n) { toast('还没有笔记。点章节头部的「写笔记」开始。', 'warn'); return; }
    var blob = new Blob([out.join('\n')], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'elephant-learn-notes-' + PAGE.track + '.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('已导出 ' + n + ' 条笔记', 'ok'); Sound.play('done');
  }

  /* ---------- 任务勾选恢复 ---------- */
  (function () {
    var tasks = store.get('tasks', {});
    $$('.task-box').forEach(function (b) {
      if (tasks[b.dataset.task]) { b.classList.add('on'); b.setAttribute('aria-checked', 'true'); var li = b.closest('li'); if (li) li.classList.add('done'); }
    });
  })();

  /* ---------- 代码抽屉 ---------- */
  var drawer = $('#codeDrawer'), loadedCode = {};
  function loadBundle(track, cb) {
    if (window.__CODE__ && window.__CODE__[track]) return cb(window.__CODE__[track]);
    if (loadedCode[track]) return loadedCode[track].push(cb);
    loadedCode[track] = [cb];
    var s = document.createElement('script');
    s.src = DEPTH + 'assets/code/' + track + '.js';
    s.onload = function () {
      var data = (window.__CODE__ || {})[track] || { files: {}, dirs: {} };
      (loadedCode[track] || []).forEach(function (f) { f(data); });
      loadedCode[track] = null;
    };
    s.onerror = function () { toast('代码包加载失败：' + track, 'warn'); loadedCode[track] = null; };
    document.head.appendChild(s);
  }
  var TRACK_DIRS = ['typescript', 'python', 'java', 'ack-k8s', 'security', 'project-communication'];
  function trackOf(p) {
    var top = p.split('/')[0];
    return TRACK_DIRS.indexOf(top) >= 0 ? top : (PAGE.track || 'typescript');
  }
  function openDrawer(p) {
    if (!drawer || !p) return;
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    Sound.play('open');
    var track = trackOf(p);
    loadBundle(track, function (data) {
      var body = $('#drawerBody');
      if (p.charAt(p.length - 1) === '/') {
        var list = (data.dirs || {})[p] || [];
        $('#drawerTitle').textContent = p.split('/').filter(Boolean).pop() + '/';
        $('#drawerPath').textContent = p + '  ·  ' + list.length + ' 个文件';
        body.innerHTML = '<div class="drawer-list">' + list.sort().map(function (f) {
          var meta = data.files[f] || {};
          return '<a href="#code" data-code="' + f + '"><span>' + f.slice(p.length) + '</span><span class="dl-size">' + (meta.s ? (meta.s / 1024).toFixed(1) + ' KB' : '') + '</span></a>';
        }).join('') + '</div>';
        return;
      }
      var f = (data.files || {})[p];
      $('#drawerTitle').textContent = p.split('/').pop();
      $('#drawerPath').textContent = p;
      if (!f) {
        body.innerHTML = '<div class="sr-empty">仓库里没有这个文件（可能是构建产物）。<br><code>' + p + '</code></div>';
        return;
      }
      var lines = f.t.replace(/\n$/, '').split('\n');
      var HL = window.HL;
      body.innerHTML = '<figure class="code" data-lang="' + HL.normalize(f.l) + '"><figcaption>' +
        '<span class="code-lang">' + HL.label(f.l) + '</span><span class="code-meta">' + lines.length + ' 行 · ' + (f.s / 1024).toFixed(1) + ' KB</span>' +
        '<button class="code-copy" type="button" id="drawerCopy2"><span>复制</span></button></figcaption>' +
        '<div class="code-body"><pre class="numbered"><span class="gutter" aria-hidden="true">' +
        lines.map(function (_, i) { return '<i>' + (i + 1) + '</i>'; }).join('') +
        '</span><code>' + HL.highlight(f.t.replace(/\n$/, ''), f.l) + '</code></pre></div></figure>';
      var b2 = $('#drawerCopy2');
      if (b2) b2.addEventListener('click', function () {
        copyText(f.t).then(function () { toast('已复制 ' + p, 'ok'); Sound.play('ok'); });
      });
      body.scrollTop = 0;
    });
  }
  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    if ($('#searchModal') && !$('#searchModal').hidden) return;
    document.body.style.overflow = '';
    Sound.play('close');
  }
  window.ELOpenCode = openDrawer;

  /* ---------- 搜索 ---------- */
  var modal = $('#searchModal'), searchInput = $('#searchInput'), resultsBox = $('#searchResults');
  var searchLoaded = false, searchSel = 0, searchHits = [], searchTrack = 'all';
  var TRACK_META = {
    typescript: { n: 'TypeScript', c: '#4C9AFF' }, python: { n: 'Python', c: '#FFD43B' },
    java: { n: 'Java', c: '#FF8A4C' }, 'ack-k8s': { n: 'ACK/K8s', c: '#37D6FF' },
    security: { n: '安全', c: '#37E39B' }, 'project-communication': { n: '项目沟通', c: '#FF7AB8' }
  };
  function openSearch() {
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    Sound.play('open');
    var filter = $('#searchFilter');
    if (filter && !filter.childElementCount) {
      var chips = ['all'].concat(Object.keys(TRACK_META));
      filter.innerHTML = chips.map(function (k) {
        return '<button class="sf-chip' + (k === 'all' ? ' on' : '') + '" data-track="' + k + '" type="button">' + (k === 'all' ? '全部教材' : TRACK_META[k].n) + '</button>';
      }).join('');
      filter.addEventListener('click', function (e) {
        var b = e.target.closest('.sf-chip'); if (!b) return;
        searchTrack = b.dataset.track;
        $$('.sf-chip', filter).forEach(function (x) { x.classList.toggle('on', x === b); });
        runSearch(searchInput.value);
      });
    }
    if (!searchLoaded) {
      searchLoaded = true;
      var s = document.createElement('script');
      s.src = DEPTH + 'assets/search-index.js';
      s.onload = function () { runSearch(''); };
      document.head.appendChild(s);
    } else runSearch(searchInput.value);
    setTimeout(function () { searchInput.focus(); searchInput.select(); }, 40);
  }
  function closeSearch() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (!drawer || drawer.hidden) document.body.style.overflow = '';
    Sound.play('close');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function runSearch(q) {
    var idx = window.__SEARCH__ || [];
    q = (q || '').trim().toLowerCase();
    var terms = q.split(/\s+/).filter(Boolean);
    var hits = [];
    idx.forEach(function (it) {
      if (searchTrack !== 'all' && it.t !== searchTrack) return;
      if (!terms.length) { hits.push({ it: it, score: 0, snip: it.body.slice(0, 150) }); return; }
      var title = it.title.toLowerCase(), heads = (it.h || []).join(' ').toLowerCase(), body = it.body.toLowerCase();
      var score = 0, ok = true, first = -1;
      terms.forEach(function (term) {
        var ti = title.indexOf(term), hi = heads.indexOf(term), bi = body.indexOf(term);
        if (ti < 0 && hi < 0 && bi < 0) { ok = false; return; }
        score += (ti >= 0 ? 12 : 0) + (hi >= 0 ? 6 : 0) + (bi >= 0 ? 2 : 0);
        if (ti >= 0) score += 4;
        if (first < 0) first = bi >= 0 ? bi : (hi >= 0 ? 0 : 0);
      });
      if (!ok) return;
      var snip = '';
      if (first >= 0) {
        var s = Math.max(0, first - 50);
        snip = (s > 0 ? '…' : '') + it.body.slice(s, s + 190);
      } else snip = it.body.slice(0, 160);
      hits.push({ it: it, score: score, snip: snip });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    searchHits = hits.slice(0, 60);
    searchSel = 0;
    paintSearch(terms);
  }
  function markSnip(text, terms) {
    var out = esc(text);
    terms.forEach(function (t) {
      if (!t) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  function paintSearch(terms) {
    $('#searchCount').textContent = searchHits.length + ' 条结果';
    if (!searchHits.length) {
      resultsBox.innerHTML = '<div class="sr-empty">没有匹配。试试「事件循环」「乐观锁」「GIL」「Pod」「变更」这类关键词。</div>';
      return;
    }
    resultsBox.innerHTML = searchHits.map(function (h, i) {
      var m = TRACK_META[h.it.t] || { n: h.it.t, c: '#888' };
      return '<a class="sr-item' + (i === searchSel ? ' sel' : '') + '" href="' + DEPTH + h.it.t + '.html#' + h.it.id + '" data-i="' + i + '">' +
        '<div class="sr-top"><span class="sr-track" style="background:' + m.c + '">' + m.n + '</span>' +
        '<span class="sr-title">' + markSnip(h.it.title, terms) + '</span></div>' +
        '<div class="sr-snip">' + markSnip(h.snip, terms) + '</div></a>';
    }).join('');
    $$('.sr-item', resultsBox).forEach(function (a) {
      a.addEventListener('mouseenter', function () { searchSel = +a.dataset.i; paintSel(); });
      a.addEventListener('click', function () { Sound.play('step'); closeSearch(); });
    });
  }
  function paintSel() {
    $$('.sr-item', resultsBox).forEach(function (a, i) { a.classList.toggle('sel', i === searchSel); });
    var sel = $('.sr-item.sel', resultsBox);
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  if (searchInput) searchInput.addEventListener('input', function () { runSearch(searchInput.value); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); modal && modal.hidden ? openSearch() : closeSearch(); return; }
    if (e.key === 'Escape') { closeSearch(); closeDrawer(); closeSidebar(); return; }
    if (modal && !modal.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); searchSel = Math.min(searchHits.length - 1, searchSel + 1); paintSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); searchSel = Math.max(0, searchSel - 1); paintSel(); }
      else if (e.key === 'Enter') {
        var a = $('.sr-item.sel', resultsBox);
        if (a) { Sound.play('step'); closeSearch(); location.href = a.getAttribute('href'); }
      }
      return;
    }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (PAGE.kind === 'track' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var ids = chapterIds(), i = ids.indexOf(currentId);
      if (e.key === '[' && i > 0) { showChapter(ids[i - 1], null, true); Sound.play('step'); }
      if (e.key === ']' && i < ids.length - 1) { showChapter(ids[i + 1], null, true); Sound.play('step'); }
    }
    if (e.key === '/') { e.preventDefault(); openSearch(); }
  });

  /* ---------- 首页入场 ---------- */
  if (PAGE.kind === 'home' || PAGE.kind === 'labs') {
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
    $$('.track-card, .lab-card, .m-card, .sec-head').forEach(function (el, i) {
      el.classList.add('reveal-on-scroll');
      el.style.transitionDelay = (i % 6) * 55 + 'ms';
      if (io) io.observe(el); else el.classList.add('in');
    });
    var hero = $('.hero-copy');
    if (hero) { hero.style.animation = 'chapterIn .7s cubic-bezier(.16,1,.3,1) both'; }
    var hv = $('.hero-visual');
    if (hv) { hv.style.animation = 'chapterIn .9s .12s cubic-bezier(.16,1,.3,1) both'; }
  }

  /* ---------- 启动 ---------- */
  $$('.nav-track').forEach(function (a) { if (a.dataset.track === PAGE.track) a.classList.add('active'); });
  if (PAGE.kind === 'track') { route(); paintProgress(); }
  else paintProgress();
  onScrollGlobal();
  window.addEventListener('resize', function () { if (window.innerWidth > 900) closeSidebar(); updateSpy(); }, { passive: true });
})();