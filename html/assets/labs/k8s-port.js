/* 港口调度模拟器：声明式期望状态 + 控制器循环 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var sound = window.ELSound;
  var VC = { v1: '#37D6FF', v2: '#FFB020', v3: '#FF7AB8' };
  var POD_CAP = 50; // 单副本 100% CPU 时的承载（请求/秒）

  var st;
  function fresh() {
    return {
      tick: 0, desired: 3, target: 'v1', nodes: 2, down: {},
      pods: [], nextId: 1, restarts: 0,
      rollout: null, surge: 1, unav: 0,
      hpa: false, hpaTarget: 60, load: 90,
      pdb: false, pause: false, speed: 700,
      grid: true, cpu: true, events: []
    };
  }
  st = fresh();

  function ev(msg, kind) {
    st.events.unshift({ t: st.tick, msg: msg, kind: kind || '' });
    if (st.events.length > 60) st.events.pop();
  }
  function running() { return st.pods.filter(function (p) { return p.state === 'Running'; }); }
  function healthyNodes() { var a = []; for (var i = 0; i < st.nodes; i++) if (!st.down[i]) a.push(i); return a; }
  function schedule() {
    var hn = healthyNodes(); if (!hn.length) return -1;
    var count = hn.map(function (n) { return st.pods.filter(function (p) { return p.node === n && p.state !== 'Terminating'; }).length; });
    var min = Math.min.apply(null, count);
    return hn[count.indexOf(min)];
  }
  function createPod(version) {
    var n = schedule();
    if (n < 0) { ev('FailedScheduling：没有健康节点可放', 'bad'); return null; }
    var p = { id: st.nextId++, node: n, version: version, state: 'Pending', cpu: 0 };
    st.pods.push(p);
    ev('Scheduled：pod-' + p.id + ' → node-' + n + '（' + version + '）', 'info');
    if (sound) sound.play('pop');
    return p;
  }
  function removePod(p, why) {
    st.pods = st.pods.filter(function (x) { return x !== p; });
    st.restarts++;
    ev(why + '：pod-' + p.id + ' 消失（' + p.version + '）', 'bad');
    if (sound) sound.play('err');
  }

  function reconcile() {
    st.tick++;
    if (st.pause) return;

    // 节点故障 → 其上的 Pod 丢失
    st.pods.slice().forEach(function (p) {
      if (st.down[p.node]) removePod(p, 'NodeNotReady');
    });

    // Pending → Running
    st.pods.forEach(function (p) {
      if (p.state === 'Pending') { p.state = 'Running'; ev('Started：pod-' + p.id + ' 就绪（' + p.version + '）', 'ok'); }
      else if (p.state === 'Terminating') { st.pods = st.pods.filter(function (x) { return x !== p; }); ev('Deleted：pod-' + p.id + ' 已回收', 'dim'); }
    });

    // HPA
    if (st.hpa) {
      var perPod = POD_CAP * st.hpaTarget / 100;
      var want = Math.max(1, Math.min(12, Math.ceil(st.load / perPod)));
      if (want !== st.desired) {
        ev('HorizontalPodAutoscaler：' + st.desired + ' → ' + want + '（负载 ' + st.load + ' / 目标 ' + st.hpaTarget + '%）', 'warn');
        st.desired = want;
        $('#k8sRep').value = want; $('#k8sRepOut').textContent = want; fill($('#k8sRep'));
        if (sound) sound.play('ok');
      }
    }

    var run = running();
    var avail = run.length;
    var newReady = run.filter(function (p) { return p.version === st.target; }).length;
    var old = run.filter(function (p) { return p.version !== st.target; });

    if (st.rollout) {
      var total = st.pods.filter(function (p) { return p.state !== 'Terminating'; }).length;
      if (newReady < st.desired && total < st.desired + st.surge) createPod(st.target);
      var canDelete = (avail - 1 >= st.desired - st.unav) && (!st.pdb || avail - 1 >= 2);
      if (old.length && canDelete && newReady > 0) {
        old[0].state = 'Terminating';
        ev('RollingUpdate：回收旧版本 pod-' + old[0].id + '（' + old[0].version + '）', 'warn');
      }
      if (!old.length && newReady >= st.desired) {
        st.rollout = null;
        ev('RollingUpdate 完成：全部 ' + newReady + ' 个副本已是 ' + st.target, 'ok');
        if (sound) sound.play('done');
      }
    } else {
      var active = st.pods.filter(function (p) { return p.state !== 'Terminating'; }).length;
      if (active < st.desired) createPod(st.target);
      else if (active > st.desired) {
        var excess = st.pods.filter(function (p) { return p.state === 'Running'; });
        var victim = excess[excess.length - 1];
        if (victim) {
          if (st.pdb && avail - 1 < 2) ev('PodDisruptionBudget：拒绝自愿驱逐（最少可用 2）', 'warn');
          else { victim.state = 'Terminating'; ev('ScaleDown：回收 pod-' + victim.id, 'warn'); }
        }
      }
    }

    // CPU
    var r = running();
    r.forEach(function (p) { p.cpu = r.length ? Math.min(100, Math.round(st.load / r.length / POD_CAP * 100)) : 0; });
  }

  /* ---------- SVG ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function render() {
    var svg = $('#k8sSvg');
    var W = 1000, H = 430;
    var out = '';
    // 控制面
    out += '<rect x="14" y="12" width="972" height="58" rx="12" fill="rgba(55,214,255,.06)" stroke="rgba(55,214,255,.35)"/>';
    var cp = [['API Server', '服务窗口'], ['etcd', '总账本'], ['Scheduler', '调度员'], ['Controller', '巡查员']];
    cp.forEach(function (c, i) {
      var x = 30 + i * 244;
      out += '<rect x="' + x + '" y="22" width="228" height="38" rx="9" fill="rgba(10,15,24,.85)" stroke="rgba(146,172,210,.25)"/>';
      out += '<text x="' + (x + 12) + '" y="38" fill="#37D6FF" font-size="12" font-family="JetBrains Mono,monospace" font-weight="700">' + c[0] + '</text>';
      out += '<text x="' + (x + 12) + '" y="53" fill="#6C7C95" font-size="10.5" font-family="JetBrains Mono,monospace">' + c[1] + (i === 3 ? (st.pause ? '（已暂停）' : '（核对中）') : '') + '</text>';
    });
    // 节点
    var n = st.nodes;
    var gap = 16, nw = (W - 28 - gap * (n - 1)) / n;
    for (var i = 0; i < n; i++) {
      var x = 14 + i * (nw + gap), y = 86, nh = H - y - 14;
      var down = !!st.down[i];
      out += '<rect x="' + x + '" y="' + y + '" width="' + nw + '" height="' + nh + '" rx="14" fill="' + (down ? 'rgba(255,77,94,.07)' : 'rgba(146,172,210,.05)') + '" stroke="' + (down ? '#FF4D5E' : 'rgba(146,172,210,.3)') + '" stroke-width="' + (down ? 2 : 1) + '"' + (down ? ' stroke-dasharray="6 4"' : '') + '/>';
      out += '<text x="' + (x + 14) + '" y="' + (y + 24) + '" fill="' + (down ? '#FF4D5E' : '#A5B3C9') + '" font-size="12.5" font-family="JetBrains Mono,monospace" font-weight="700">场地 node-' + i + (down ? ' · NotReady' : '') + '</text>';
      out += '<text x="' + (x + 14) + '" y="' + (y + 40) + '" fill="#6C7C95" font-size="10" font-family="JetBrains Mono,monospace">kubelet · 管理员</text>';
      if (st.grid) {
        for (var g = 1; g < 4; g++) out += '<line x1="' + (x + 8) + '" y1="' + (y + 48 + g * 78) + '" x2="' + (x + nw - 8) + '" y2="' + (y + 48 + g * 78) + '" stroke="rgba(146,172,210,.08)"/>';
      }
      var pods = st.pods.filter(function (p) { return p.node === i; });
      var cols = 4, cw = (nw - 28) / cols, ch = 62;
      pods.forEach(function (p, k) {
        var cx = x + 14 + (k % cols) * cw, cy = y + 52 + Math.floor(k / cols) * (ch + 10);
        if (cy + ch > y + nh - 8) return;
        var col = VC[p.version];
        var term = p.state === 'Terminating', pend = p.state === 'Pending';
        out += '<g class="k8s-pod">';
        out += '<rect x="' + cx + '" y="' + cy + '" width="' + (cw - 8) + '" height="' + ch + '" rx="8" fill="' + (pend || term ? 'transparent' : col + '22') + '" stroke="' + (term ? '#FF4D5E' : pend ? '#6C7C95' : col) + '" stroke-width="1.6"' + (pend || term ? ' stroke-dasharray="5 4"' : '') + '/>';
        // 集装箱波纹
        if (!pend && !term) for (var wv = 1; wv < 4; wv++) out += '<line x1="' + (cx + 6 + wv * (cw - 20) / 4) + '" y1="' + (cy + 8) + '" x2="' + (cx + 6 + wv * (cw - 20) / 4) + '" y2="' + (cy + ch - 20) + '" stroke="' + col + '" stroke-opacity=".35"/>';
        out += '<text x="' + (cx + 8) + '" y="' + (cy + 18) + '" fill="' + (pend || term ? '#6C7C95' : col) + '" font-size="11" font-family="JetBrains Mono,monospace" font-weight="700">pod-' + p.id + '</text>';
        out += '<text x="' + (cx + 8) + '" y="' + (cy + 32) + '" fill="#A5B3C9" font-size="9.5" font-family="JetBrains Mono,monospace">' + p.version + ' · ' + p.state + '</text>';
        if (st.cpu && p.state === 'Running') {
          out += '<rect x="' + (cx + 8) + '" y="' + (cy + ch - 14) + '" width="' + (cw - 24) + '" height="5" rx="2.5" fill="rgba(146,172,210,.15)"/>';
          out += '<rect x="' + (cx + 8) + '" y="' + (cy + ch - 14) + '" width="' + ((cw - 24) * p.cpu / 100) + '" height="5" rx="2.5" fill="' + (p.cpu > st.hpaTarget ? '#FFB020' : '#37E39B') + '"/>';
        }
        if (st.grid) out += '<text x="' + (cx + cw - 16) + '" y="' + (cy + 18) + '" fill="#6C7C95" font-size="8.5" text-anchor="end" font-family="JetBrains Mono,monospace">app=shop</text>';
        out += '</g>';
      });
    }
    svg.innerHTML = out;

    var run = running();
    $('#k8sDesired').textContent = st.desired;
    $('#k8sReady').textContent = run.length;
    var gapN = st.desired - run.length;
    $('#k8sDiff').textContent = (gapN > 0 ? '+' : '') + gapN;
    $('#k8sDiff').parentElement.className = 'readout ' + (gapN === 0 ? 'ok' : 'warn');
    $('#k8sVersion').textContent = st.target;
    $('#k8sRestarts').textContent = st.restarts;
    $('#k8sNodes').textContent = healthyNodes().length + '/' + st.nodes;
    $('#k8sTick').textContent = 'tick ' + st.tick + (st.rollout ? ' · 滚动更新中' : '');
    $('#k8sMode').textContent = st.pause ? '控制器已暂停 · 不会自愈' : '声明式 · 控制器循环';
    $('#k8sEvents').innerHTML = st.events.length
      ? st.events.map(function (e) { return '<div class="cl ' + e.kind + '"><span class="cl-i">t' + String(e.t).padStart(3, '0') + '</span><span class="cl-t">' + esc(e.msg) + '</span></div>'; }).join('')
      : '<div class="cl dim"><span class="cl-i">···</span><span class="cl-t">等待第一个 reconcile…</span></div>';
  }

  /* ---------- 控制 ---------- */
  function fill(el) { var min = +el.min || 0, max = +el.max || 100; el.style.setProperty('--fill', ((+el.value - min) / (max - min) * 100) + '%'); }
  function bindRange(id, outId, fmt, set) {
    var el = $('#' + id);
    fill(el);
    el.addEventListener('input', function () {
      fill(el);
      if (outId) $('#' + outId).textContent = fmt(+el.value);
      set(+el.value);
      render();
    });
  }
  bindRange('k8sRep', 'k8sRepOut', String, function (v) { st.desired = v; });
  bindRange('k8sSurge', 'k8sSurgeOut', String, function (v) { st.surge = v; });
  bindRange('k8sUnav', 'k8sUnavOut', String, function (v) { st.unav = v; });
  bindRange('k8sTarget', 'k8sTargetOut', function (v) { return v + '%'; }, function (v) { st.hpaTarget = v; });
  bindRange('k8sLoad', 'k8sLoadOut', String, function (v) { st.load = v; });
  bindRange('k8sSpeed', 'k8sSpeedOut', function (v) { return v + 'ms'; }, function (v) { st.speed = v; restart(); });

  $('#k8sVer').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    $$('#k8sVer button').forEach(function (x) { x.classList.toggle('on', x === b); });
    st.target = b.dataset.v;
    startRollout();
  });
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function startRollout() {
    var old = running().filter(function (p) { return p.version !== st.target; });
    if (!old.length) { ev('镜像已是 ' + st.target + '，无需更新', 'dim'); render(); return; }
    st.rollout = { from: old[0].version, to: st.target };
    ev('RollingUpdate 开始：' + old[0].version + ' → ' + st.target + '（surge=' + st.surge + ', unav=' + st.unav + '）', 'warn');
    if (sound) sound.play('step');
    render();
  }
  $('#k8sRollout').addEventListener('click', startRollout);
  $('#k8sHpa').addEventListener('change', function () { st.hpa = this.checked; ev(this.checked ? 'HPA 已启用' : 'HPA 已关闭', 'info'); render(); });
  $('#k8sPdb').addEventListener('change', function () { st.pdb = this.checked; render(); });
  $('#k8sPause').addEventListener('change', function () { st.pause = this.checked; ev(this.checked ? '控制器暂停：期望不再被追平' : '控制器恢复', 'warn'); render(); });
  $('#k8sGrid').addEventListener('change', function () { st.grid = this.checked; render(); });
  $('#k8sCpu').addEventListener('change', function () { st.cpu = this.checked; render(); });
  $('#k8sNodePlus').addEventListener('click', function () { if (st.nodes < 4) { st.nodes++; $('#k8sNodeOut').textContent = st.nodes; ev('NodeAdded：node-' + (st.nodes - 1), 'info'); render(); } });
  $('#k8sNodeMinus').addEventListener('click', function () {
    if (st.nodes > 1) {
      st.nodes--; delete st.down[st.nodes];
      st.pods.slice().forEach(function (p) { if (p.node >= st.nodes) removePod(p, 'NodeRemoved'); });
      $('#k8sNodeOut').textContent = st.nodes; render();
    }
  });
  $('#k8sKill').addEventListener('click', function () {
    var r = running(); if (!r.length) return;
    removePod(r[Math.floor(Math.random() * r.length)], 'Chaos：手动删除');
    render();
  });
  $('#k8sNodeFail').addEventListener('click', function () {
    var hn = healthyNodes();
    if (!hn.length) { st.down = {}; ev('所有节点恢复', 'ok'); }
    else { var n = hn[Math.floor(Math.random() * hn.length)]; st.down[n] = true; ev('Chaos：node-' + n + ' 断电', 'bad'); }
    render();
  });
  $('#k8sReset').addEventListener('click', function () {
    st = fresh();
    $('#k8sRep').value = 3; $('#k8sRepOut').textContent = '3'; fill($('#k8sRep'));
    $('#k8sLoad').value = 90; $('#k8sLoadOut').textContent = '90'; fill($('#k8sLoad'));
    $('#k8sNodeOut').textContent = '2';
    $('#k8sHpa').checked = false; $('#k8sPdb').checked = false; $('#k8sPause').checked = false;
    $$('#k8sVer button').forEach(function (x) { x.classList.toggle('on', x.dataset.v === 'v1'); });
    ev('港口重置：期望 3 副本 / v1 / 2 节点', 'info');
    if (sound) sound.play('close');
    render();
  });
  $('#k8sRandom').addEventListener('click', function () {
    st.desired = 2 + Math.floor(Math.random() * 8);
    st.nodes = 1 + Math.floor(Math.random() * 3);
    st.load = 40 + Math.floor(Math.random() * 40) * 10;
    st.hpa = Math.random() > 0.5;
    st.target = ['v1', 'v2', 'v3'][Math.floor(Math.random() * 3)];
    $('#k8sRep').value = st.desired; $('#k8sRepOut').textContent = st.desired; fill($('#k8sRep'));
    $('#k8sLoad').value = st.load; $('#k8sLoadOut').textContent = st.load; fill($('#k8sLoad'));
    $('#k8sNodeOut').textContent = st.nodes;
    $('#k8sHpa').checked = st.hpa;
    $$('#k8sVer button').forEach(function (x) { x.classList.toggle('on', x.dataset.v === st.target); });
    st.pods = []; st.rollout = null;
    ev('随机场景：' + st.desired + ' 副本 / ' + st.target + ' / ' + st.nodes + ' 节点 / 负载 ' + st.load, 'info');
    if (sound) sound.play('open');
    render();
  });

  var timer = null;
  function restart() { clearInterval(timer); timer = setInterval(function () { reconcile(); render(); }, st.speed); }
  ev('港口开张：期望 3 副本 / v1 / 2 节点。改右侧任何旋钮，看控制器追平。', 'info');
  render();
  restart();
})();