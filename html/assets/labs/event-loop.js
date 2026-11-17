/* 事件循环实验台 */
(function () {
  'use strict';
  var DATA = window.__EL_DATA__ || { snippets: [], verify: [] };
  var S = DATA.snippets;
  var $ = function (s) { return document.querySelector(s); };
  var sound = window.ELSound;
  var state = { idx: 0, step: 0, playing: false, timer: null, speed: 1 };

  var sel = $('#elSnippet');
  sel.innerHTML = S.map(function (s, i) { return '<option value="' + i + '">' + (i + 1) + '. ' + s.name + '（' + s.level + '）</option>'; }).join('');
  var okCount = DATA.verify.filter(function (v) { return v.ok; }).length;
  $('#elVerified').textContent = okCount + '/' + S.length;
  if (okCount !== S.length) $('#elVerified').parentElement.className = 'readout bad';

  function cur() { return S[state.idx]; }
  function steps() { return cur().steps; }

  function sliderFill(el) {
    var min = +el.min || 0, max = +el.max || 100, v = +el.value;
    el.style.setProperty('--fill', ((v - min) / (max - min) * 100) + '%');
  }

  function lineFor(step, code) {
    var lines = code.split('\n');
    var want = null;
    if (step.kind === 'log') want = step.out[step.out.length - 1];
    else if (step.kind === 'mq' || step.kind === 'mr') want = /queueMicrotask/.test(step.focusName || '') ? 'queueMicrotask' : (/nextTick/.test(step.focusName || '') ? 'nextTick' : '.then(');
    else if (step.kind === 'tq' || step.kind === 'tr') want = 'setTimeout';
    else if (step.kind === 'nt' || step.kind === 'nr') want = 'nextTick';
    if (!want) return -1;
    for (var i = 0; i < lines.length; i++) if (lines[i].indexOf(want) >= 0) return i;
    return -1;
  }

  function renderCode() {
    var s = cur();
    var st = steps()[state.step];
    var hl = window.HL;
    var lines = s.code.split('\n');
    var curLine = $('#elShowSrc').checked && st ? lineFor(st, s.code) : -1;
    $('#elCode').innerHTML = lines.map(function (ln, i) {
      return '<span class="cl-line' + (i === curLine ? ' cur' : '') + '" style="display:block;' + (i === curLine ? 'background:color-mix(in srgb, var(--ta) 18%, transparent);box-shadow:inset 2px 0 0 var(--ta);' : '') + '">' + (hl ? hl.highlight(ln, 'ts') : ln.replace(/&/g, '&amp;').replace(/</g, '&lt;')) + '</span>';
    }).join('');
    $('#elSnippetTag').textContent = s.id + ' · ' + s.code.split('\n').length + ' 行';
    $('#elLevel').textContent = s.level;
    $('#elTeach').textContent = s.teach;
  }

  function chips(list, isMacro) {
    if (!list.length) return '<span class="el-empty">（空）</span>';
    return list.map(function (x, i) {
      var name = isMacro ? x.name : x;
      var ms = isMacro && x.ms !== undefined ? '<span class="ms">' + x.ms + 'ms</span>' : '';
      return '<span class="el-chip' + (i === 0 ? ' head' : '') + '">' + name + ms + '</span>';
    }).join('');
  }

  function render() {
    var st = steps()[state.step];
    if (!st) return;
    $('#elPhase').textContent = st.phase || (st.kind === 'phase' ? '' : lastPhase());
    if (st.kind === 'phase') $('#elPhase').textContent = st.phase;
    $('#elStep').textContent = '步骤 ' + (state.step + 1) + ' / ' + steps().length;
    $('#elStack').innerHTML = st.stack.length
      ? st.stack.map(function (f, i) { return '<div class="el-frame' + (i === st.stack.length - 1 ? ' top' : '') + '">' + f + '</div>'; }).join('')
      : '<span class="el-empty">（空）</span>';
    $('#elStackN').textContent = st.stack.length;
    $('#elTick').innerHTML = chips(st.tick, false);
    $('#elTickN').textContent = st.tick.length;
    $('#elMicro').innerHTML = chips(st.micro, false);
    $('#elMicroN').textContent = st.micro.length;
    $('#elMacro').innerHTML = chips(st.macro, true);
    $('#elMacroN').textContent = st.macro.length;
    $('#elOut').innerHTML = st.out.length
      ? st.out.map(function (l, i) { return '<div class="cl"><span class="cl-i">' + String(i + 1).padStart(2, '0') + '</span><span class="cl-t">' + l.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span></div>'; }).join('')
      : '<div class="cl dim"><span class="cl-i">··</span><span class="cl-t">（还没有输出）</span></div>';
    $('#elOut').scrollTop = $('#elOut').scrollHeight;
    var note = $('#elNote');
    if ($('#elShowNote').checked) {
      note.hidden = false;
      note.innerHTML = '<span class="nr-k">本帧在发生什么 · ' + kindName(st.kind) + '</span>' + (st.note || '观察左侧队列与栈的变化。');
    } else note.hidden = true;
    var hot = $('#elHot').checked ? st.focus : '';
    $('#qMicro').classList.toggle('hot', hot === 'micro');
    $('#qMacro').classList.toggle('hot', hot === 'macro');
    $('#qTick').classList.toggle('hot', hot === 'tick');
    $('#qTick').hidden = !$('#elShowTick').checked;
    var scrub = $('#elScrub');
    scrub.max = steps().length - 1; scrub.value = state.step; sliderFill(scrub);
    $('#elScrubOut').textContent = state.step + 1;
    $('#elFrames').textContent = steps().length;
    $('#elPrev').disabled = state.step === 0;
    $('#elNext').disabled = state.step >= steps().length - 1;
    renderCode();
  }
  function lastPhase() {
    for (var i = state.step; i >= 0; i--) if (steps()[i].kind === 'phase') return steps()[i].phase;
    return '同步阶段';
  }
  function kindName(k) {
    return { phase: '阶段切换', push: '入栈', pop: '出栈', log: '输出', mq: '微任务入队', mr: '微任务出队执行', tq: '宏任务登记', tr: '宏任务执行', nt: 'nextTick 入队', nr: 'nextTick 执行', note: '注解' }[k] || k;
  }

  function goto(i, silent) {
    state.step = Math.max(0, Math.min(steps().length - 1, i));
    render();
    if (!silent && sound) sound.play(steps()[state.step].kind === 'log' ? 'pop' : 'tick');
  }
  function stop() {
    state.playing = false;
    clearInterval(state.timer); state.timer = null;
    $('#elPlay').textContent = '播放';
  }
  function play() {
    if (state.playing) { stop(); return; }
    if (state.step >= steps().length - 1) goto(0, true);
    state.playing = true;
    $('#elPlay').textContent = '暂停';
    state.timer = setInterval(function () {
      if (state.step >= steps().length - 1) {
        if ($('#elLoop').checked) goto(0, true);
        else { stop(); if (sound) sound.play('done'); }
        return;
      }
      goto(state.step + 1);
    }, 900 / state.speed);
  }
  function load(i) {
    stop();
    state.idx = i; state.step = 0;
    sel.value = String(i);
    render();
  }

  sel.addEventListener('change', function () { load(+sel.value); if (sound) sound.play('step'); });
  $('#elPlay').addEventListener('click', play);
  $('#elNext').addEventListener('click', function () { stop(); goto(state.step + 1); });
  $('#elPrev').addEventListener('click', function () { stop(); goto(state.step - 1); });
  $('#elReset').addEventListener('click', function () { load(state.idx); if (sound) sound.play('close'); });
  $('#elRandom').addEventListener('click', function () {
    var i = Math.floor(Math.random() * S.length);
    if (i === state.idx) i = (i + 1) % S.length;
    load(i); if (sound) sound.play('open');
  });
  $('#elSpeed').addEventListener('input', function () {
    state.speed = +this.value; sliderFill(this);
    $('#elSpeedOut').textContent = state.speed.toFixed(2).replace(/0$/, '') + '×';
    if (state.playing) { clearInterval(state.timer); state.timer = setInterval(function () { $('#elNext').disabled ? stop() : goto(state.step + 1); }, 900 / state.speed); }
  });
  $('#elScrub').addEventListener('input', function () { stop(); goto(+this.value, true); });
  ['elShowTick', 'elShowNote', 'elShowSrc', 'elHot'].forEach(function (id) {
    $('#' + id).addEventListener('change', render);
  });
  $('#elExport').addEventListener('click', function () {
    var s = cur();
    var payload = { snippet: s.id, name: s.name, code: s.code, verified: (DATA.verify[state.idx] || {}).ok, steps: s.steps };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'event-loop-' + s.id + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    if (window.ELToast) window.ELToast('已导出 ' + s.id + ' 的 trace', 'ok');
    if (sound) sound.play('ok');
  });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === ' ') { e.preventDefault(); play(); }
    if (e.key === 'ArrowRight') { stop(); goto(state.step + 1); }
    if (e.key === 'ArrowLeft') { stop(); goto(state.step - 1); }
  });

  sliderFill($('#elSpeed'));
  load(0);
})();