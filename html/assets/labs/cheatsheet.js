/* PHP → X 速查表：附录合并 + 即时过滤 */
(function () {
  'use strict';
  var ROWS = window.__CS_DATA__ || [];
  var $ = function (s) { return document.querySelector(s); };
  var sound = window.ELSound;
  var META = {
    typescript: { n: 'TypeScript', c: '#4C9AFF' }, python: { n: 'Python', c: '#FFD43B' },
    java: { n: 'Java', c: '#FF8A4C' }, 'ack-k8s': { n: 'ACK/K8s', c: '#37D6FF' },
    security: { n: '安全', c: '#37E39B' }, 'project-communication': { n: '项目沟通', c: '#FF7AB8' }
  };
  var state = { track: new URLSearchParams(location.search).get('track') || 'all', cat: 'all', q: '', pit: false, compact: false };
  if (!META[state.track]) state.track = 'all';

  $('#csTrack').innerHTML = ['all'].concat(Object.keys(META)).map(function (k) {
    return '<button type="button" data-t="' + k + '" class="' + (k === state.track ? 'on' : '') + '">' + (k === 'all' ? '全部' : META[k].n) + '</button>';
  }).join('');

  function cats() {
    var set = [];
    ROWS.forEach(function (r) { if ((state.track === 'all' || r.t === state.track) && set.indexOf(r.cat) < 0) set.push(r.cat); });
    return set;
  }
  function renderCats() {
    var cs = cats();
    $('#csCat').innerHTML = '<option value="all">全部分类（' + cs.length + '）</option>' + cs.map(function (c) { return '<option value="' + c + '"' + (c === state.cat ? ' selected' : '') + '>' + c + '</option>'; }).join('');
    if (cs.indexOf(state.cat) < 0) state.cat = 'all';
  }
  function visible() {
    var q = state.q.toLowerCase();
    return ROWS.filter(function (r) {
      if (state.track !== 'all' && r.t !== state.track) return false;
      if (state.cat !== 'all' && r.cat !== state.cat) return false;
      if (state.pit && !r.pit) return false;
      if (q && (r.raw + ' ' + r.cat).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function render() {
    var rows = visible();
    $('#csCount').textContent = rows.length + ' / ' + ROWS.length + ' 条';
    var head = state.track === 'ack-k8s'
      ? '<tr><th style="width:22%">技术概念</th><th style="width:26%">港口类比</th><th>类比不成立的地方 / 备注</th></tr>'
      : '<tr><th style="width:26%">PHP / Laravel</th><th style="width:30%">目标写法</th><th>关键差异与坑</th></tr>';
    $('#csTable').innerHTML = '<thead>' + head + '</thead><tbody>' + rows.map(function (r, i) {
      return '<tr class="' + (r.pit ? 'pit' : '') + '" data-i="' + i + '" style="' + (state.compact ? 'font-size:12px' : '') + '">' +
        '<td class="php">' + (state.track === 'all' ? '<span class="cs-pit-flag" style="color:' + META[r.t].c + ';border-color:' + META[r.t].c + '55">' + META[r.t].n + '</span>' : '') + (r.pit ? '<span class="cs-pit-flag">坑</span>' : '') + r.php + '</td>' +
        '<td class="target" style="color:' + META[r.t].c + '">' + r.target + '</td>' +
        '<td class="note">' + r.note + '</td></tr>';
    }).join('') + '</tbody>';
    $('#csWrap').style.fontSize = state.compact ? '12px' : '';
    $$('#csTable tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var r = rows[+tr.dataset.i];
        var line = '| ' + strip(r.php) + ' | ' + strip(r.target) + ' | ' + strip(r.note) + ' |';
        copy(line);
        if (window.ELToast) window.ELToast('已复制该条对照', 'ok');
        if (sound) sound.play('pop');
      });
    });
  }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function strip(html) { var d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () {});
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove();
  }

  $('#csTrack').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.track = b.dataset.t; state.cat = 'all';
    $$('#csTrack button').forEach(function (x) { x.classList.toggle('on', x === b); });
    renderCats(); render();
    if (sound) sound.play('step');
  });
  $('#csCat').addEventListener('change', function () { state.cat = this.value; render(); });
  $('#csQuery').addEventListener('input', function () { state.q = this.value; render(); });
  $('#csPit').addEventListener('change', function () { state.pit = this.checked; render(); });
  $('#csCompact').addEventListener('change', function () { state.compact = this.checked; render(); });
  $('#csCopy').addEventListener('click', function () {
    var rows = visible();
    var md = ['# PHP → X 速查（过滤后 ' + rows.length + ' 条）', '', '| PHP / 概念 | 目标 | 差异与坑 |', '|---|---|---|'];
    rows.forEach(function (r) { md.push('| ' + strip(r.php) + ' | ' + strip(r.target) + ' | ' + strip(r.note) + ' |'); });
    copy(md.join('\n'));
    if (window.ELToast) window.ELToast('已复制 ' + rows.length + ' 条 Markdown 表格', 'ok');
    if (sound) sound.play('ok');
  });
  $('#csExport').addEventListener('click', function () {
    var rows = visible();
    var csv = ['track,category,php,target,note,pit'];
    rows.forEach(function (r) {
      csv.push([r.t, r.cat, strip(r.php), strip(r.target), strip(r.note), r.pit ? 1 : 0].map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(','));
    });
    var blob = new Blob(['\ufeff' + csv.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'php-cheatsheet.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    if (window.ELToast) window.ELToast('已导出 CSV', 'ok');
  });

  renderCats(); render();
})();