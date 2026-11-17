/* 一个请求的生命周期：NestJS 管线逐站演示，载荷与 shop-api 对齐 */
(function () {
  'use strict';
  var S = window.SHARED;
  var $ = function (s) { return document.querySelector(s); };
  var sound = window.ELSound;
  var z = S ? S.z : null;

  var DB0 = [
    { id: 1, sku: 'SKU-001', name: '机械键盘', price: '599.00', stock: 20, version: 0 },
    { id: 2, sku: 'SKU-002', name: '无线鼠标', price: '1299.00', stock: 5, version: 0 },
    { id: 3, sku: 'SKU-003', name: 'USB-C 扩展坞', price: '399.00', stock: 2, version: 0 }
  ];
  var db, orders, reqCount;
  function resetDb() { db = JSON.parse(JSON.stringify(DB0)); orders = []; reqCount = 0; }
  resetDb();

  var state = { method: 'order', auth: true, role: 'customer', accept: 'json', race: false, slow: false, speed: 1, logLevel: 'normal', stock3: 2 };
  var PRESETS = {
    order: [
      ['合法下单 ×2', '{"customerName":"ben","items":[{"productId":1,"quantity":2}]}'],
      ['缺 customerName', '{"items":[{"productId":1,"quantity":2}]}'],
      ['quantity 100（超上限）', '{"customerName":"ben","items":[{"productId":1,"quantity":100}]}'],
      ['库存不足（SKU-003 ×3）', '{"customerName":"ben","items":[{"productId":3,"quantity":3}]}'],
      ['不存在的商品 999', '{"customerName":"ben","items":[{"productId":999,"quantity":1}]}'],
      ['items 为空', '{"customerName":"ben","items":[]}']
    ],
    delete: [['无 body', '']]
  };

  var STOPS = [
    { id: 'mw', name: 'Middleware · RequestIdFilter', desc: 'app.use() · 生成或复用 X-Request-Id' },
    { id: 'guard', name: 'Guard · BasicAuthGuard', desc: 'APP_GUARD · 认证与角色' },
    { id: 'int1', name: 'Interceptor · 计时开始', desc: 'APP_INTERCEPTOR · tap(start)' },
    { id: 'pipe', name: 'Pipe · ZodValidationPipe', desc: '@Body() · schema.safeParse' },
    { id: 'ctrl', name: 'Controller · 路由分发', desc: '@Post / @Delete · 参数装饰器' },
    { id: 'svc', name: 'Service · 业务规则', desc: '库存检查 / 权限 / 冲突' },
    { id: 'repo', name: 'Repository · 事务 + 乐观锁', desc: 'db.transaction · WHERE version=?' },
    { id: 'int2', name: 'Interceptor · 计时结束', desc: 'X-Elapsed-Ms · 序列化返回值' },
    { id: 'filter', name: 'Filter · ApiExceptionHandler', desc: 'APP_FILTER · 异常 → problem+json' }
  ];
  var run = { i: -1, busy: false, stepMode: false, ctx: null, failed: -1, done: false };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pretty(o) { return JSON.stringify(o, null, 2); }
  function log(msg, kind) {
    if (state.logLevel === 'silent') return;
    if (state.logLevel === 'normal' && kind === 'verbose') return;
    var el = document.createElement('div');
    el.className = 'cl ' + (kind || '');
    el.innerHTML = '<span class="cl-i">' + (run.ctx ? run.ctx.rid : '—') + '</span><span class="cl-t">' + esc(msg) + '</span>';
    $('#rlLog').appendChild(el);
    $('#rlLog').scrollTop = $('#rlLog').scrollHeight;
  }

  function renderTrack() {
    $('#rlTrack').innerHTML = STOPS.map(function (s, i) {
      var cls = '';
      if (run.failed === i) cls = 'fail';
      else if (run.i > i || (run.done && run.failed < 0)) cls = 'pass';
      else if (run.i === i) cls = 'active';
      if (run.failed >= 0 && i > run.failed && s.id !== 'filter') cls += ' skip';
      if (s.id === 'filter' && run.failed < 0 && run.i >= 7) cls += ' skip';
      return '<div class="rl-stop ' + cls + '" data-i="' + i + '"><div class="rl-ico">' + (i + 1) + '</div>' +
        '<div><div class="rl-name">' + s.name + '</div><div class="rl-desc">' + s.desc + '</div></div>' +
        '<div class="rl-state">' + (run.failed === i ? 'THROW' : run.i === i ? 'RUNNING' : (run.i > i || run.done) ? 'PASS' : 'WAIT') + '</div></div>';
    }).join('');
  }
  function renderDb() {
    $('#rlDb').innerHTML = '<thead><tr><th>id</th><th>sku</th><th>name</th><th>stock</th><th>version</th></tr></thead><tbody>' +
      db.map(function (p) { return '<tr><td>' + p.id + '</td><td>' + p.sku + '</td><td>' + p.name + '</td><td>' + p.stock + '</td><td>' + p.version + '</td></tr>'; }).join('') +
      '</tbody>';
    $('#rlCount').textContent = reqCount;
  }

  function fail(status, problem, headers) { var e = new Error('http'); e.status = status; e.problem = problem; e.headers = headers || {}; throw e; }

  function execStop(i, c) {
    var s = STOPS[i];
    if (s.id === 'mw') {
      c.rid = 'req-' + String(reqCount).padStart(4, '0');
      log('middleware: X-Request-Id=' + c.rid + (c.reuse ? '（复用网关传入）' : '（新生成）'), 'verbose');
    } else if (s.id === 'guard') {
      if (!state.auth) {
        log('guard: 无 Authorization 头 → 401', 'bad');
        if (state.accept === 'any') fail(401, { timestamp: new Date().toISOString(), status: 401, error: 'Unauthorized', path: c.path }, { 'WWW-Authenticate': 'Basic realm="Realm"' });
        fail(401, null, {});
      }
      c.user = state.role;
      log('guard: Basic ' + state.role + ' → 通过（roles=' + (state.role === 'admin' ? 'ADMIN' : 'CUSTOMER') + '）', 'verbose');
      if (state.method === 'delete' && state.role !== 'admin') { log('guard: DELETE 需要 ADMIN → 403', 'bad'); fail(403, { title: '禁止访问', status: 403, detail: '需要 ADMIN 角色' }); }
    } else if (s.id === 'int1') {
      c.t0 = performance.now();
      log('interceptor: 计时开始', 'verbose');
    } else if (s.id === 'pipe') {
      if (state.method === 'order') {
        var raw;
        try { raw = JSON.parse($('#rlBody').value || '{}'); } catch (e) { fail(400, S.badRequestProblem('请求体不是合法 JSON')); }
        var res = S.PlaceOrderRequestSchema.safeParse(raw);
        if (!res.success) {
          var errs = S.toFieldErrors(res.error);
          log('pipe: ZodError → 400，字段 ' + Object.keys(errs).join(', '), 'bad');
          fail(400, S.validationProblem(errs));
        }
        c.dto = res.data;
        log('pipe: safeParse 通过 → ' + JSON.stringify(c.dto), 'verbose');
      } else log('pipe: DELETE 无 body，跳过', 'verbose');
    } else if (s.id === 'ctrl') {
      log('controller: ' + (state.method === 'order' ? 'POST /api/orders' : 'DELETE /api/products/1') + ' → ' + (state.method === 'order' ? 'OrderService.place' : 'ProductService.remove'), 'info');
    } else if (s.id === 'svc') {
      if (state.method === 'order') {
        c.lines = [];
        c.dto.items.forEach(function (it) {
          var p = db.filter(function (x) { return x.id === it.productId; })[0];
          if (!p) { log('service: 商品不存在 ' + it.productId + ' → 404', 'bad'); fail(404, S.notFoundProblem('商品 不存在: ' + it.productId)); }
          if (it.quantity > p.stock) { log('service: 库存不足 sku=' + p.sku + ' 需要=' + it.quantity + ' 剩余=' + p.stock + ' → 409', 'bad'); fail(409, S.insufficientStockProblem({ sku: p.sku, requested: it.quantity, available: p.stock })); }
          c.lines.push({ p: p, qty: it.quantity });
        });
        log('service: 库存检查通过（' + c.lines.length + ' 行）', 'verbose');
      } else {
        var p1 = db.filter(function (x) { return x.id === 1; })[0];
        if (!p1) fail(404, S.notFoundProblem('商品 不存在: 1'));
        if (orders.some(function (o) { return o.items.some(function (it) { return it.productId === 1; }); })) { log('service: 商品被订单引用 → 409', 'bad'); fail(409, S.conflictProblem('商品被订单引用，不能删除: 1')); }
      }
    } else if (s.id === 'repo') {
      if (state.slow) { log('repository: 慢查询 +1200ms（事件循环被同步占用！）', 'warn'); c.slowWait = 1200; }
      if (state.method === 'order') {
        if (state.race) {
          var v0 = c.lines[0].p.version;
          c.lines[0].p.version++; // 模拟另一个事务先 commit
          log('repository: 交错！另一事务先 commit，version ' + v0 + ' → ' + c.lines[0].p.version, 'warn');
          log('repository: UPDATE … WHERE id=1 AND version=' + v0 + ' 影响 0 行 → 乐观锁冲突 409', 'bad');
          fail(409, S.optimisticLockProblem());
        }
        var total = '0.00';
        var items = c.lines.map(function (l) {
          var sub = S.multiplyDecimalByInt(S.parseDecimal(l.p.price), l.qty);
          total = S.addDecimal(S.parseDecimal(total), S.parseDecimal(sub));
          l.p.stock -= l.qty; l.p.version++;
          return { productId: l.p.id, sku: l.p.sku, unitPrice: l.p.price, quantity: l.qty, subtotal: sub };
        });
        var order = { id: orders.length + 1, customerName: c.dto.customerName, status: 'PENDING', total: total, createdAt: S.localIsoDateTime(new Date()), version: 0, items: items };
        orders.push(order);
        c.result = order;
        log('repository: transaction commit · 订单 #' + order.id + ' total=' + total + ' · 库存与 version 已更新', 'ok');
      } else {
        db = db.filter(function (x) { return x.id !== 1; });
        c.result = null; c.status = 204;
        log('repository: DELETE commit · 商品 1 已删除', 'ok');
      }
    } else if (s.id === 'int2') {
      c.elapsed = Math.round(performance.now() - c.t0 + (c.slowWait || 0));
      log('interceptor: X-Elapsed-Ms=' + c.elapsed, 'verbose');
    } else if (s.id === 'filter') {
      log('filter: ' + c.err.status + ' → application/problem+json', 'bad');
    }
  }

  function finish(c) {
    run.done = true; run.busy = false;
    reqCount++;
    var status, headers = { 'X-Request-Id': c.rid }, body;
    if (c.err) {
      status = c.err.status;
      headers['Content-Type'] = 'application/problem+json';
      Object.keys(c.err.headers || {}).forEach(function (k) { headers[k] = c.err.headers[k]; });
      body = c.err.problem;
    } else if (c.status === 204) {
      status = 204; body = null;
    } else {
      status = 201;
      headers['Content-Type'] = 'application/json';
      headers['Location'] = '/api/orders/' + c.result.id;
      headers['X-Elapsed-Ms'] = String(c.elapsed);
      body = c.result;
    }
    var cls = status < 300 ? 's2' : status < 500 ? 's4' : 's5';
    $('#rlStatus').innerHTML = '<span class="rl-status ' + cls + '">HTTP ' + status + '</span>';
    var head = 'HTTP/1.1 ' + status + '\n' + Object.keys(headers).map(function (k) { return k + ': ' + headers[k]; }).join('\n') + '\n\n';
    $('#rlResp').textContent = head + (body === null ? '（空 body）' : pretty(body));
    $('#rlRespTag').textContent = status + ' · ' + (c.elapsed !== undefined ? c.elapsed + 'ms' : '—');
    $('#rlElapsed').textContent = c.elapsed !== undefined ? c.elapsed : '—';
    $('#rlTag').textContent = '完成 · HTTP ' + status;
    renderDb(); renderTrack();
    if (sound) sound.play(status < 300 ? 'done' : 'err');
  }

  function advance() {
    if (run.done || run.busy === 'wait') return;
    var c = run.ctx;
    var next = run.i + 1;
    if (run.failed >= 0) {
      // 跳到 filter
      var fi = STOPS.findIndex(function (s) { return s.id === 'filter'; });
      if (run.i >= fi) { finish(c); return; }
      next = fi;
    }
    if (next >= STOPS.length) { finish(c); return; }
    if (STOPS[next].id === 'filter' && run.failed < 0) { finish(c); return; }
    run.i = next;
    renderTrack();
    try {
      execStop(next, c);
    } catch (e) {
      if (e.status) { run.failed = next; c.err = e; log('抛出 → 由 Filter 接住', 'warn'); renderTrack(); }
      else throw e;
    }
    if (run.failed >= 0 && STOPS[next].id === 'filter') { finish(c); return; }
    if (!run.stepMode) schedule();
  }
  function schedule() {
    run.busy = 'wait';
    var delay = 620 / state.speed + (run.ctx && run.ctx.slowWait && STOPS[run.i].id === 'repo' ? run.ctx.slowWait : 0);
    setTimeout(function () { run.busy = false; advance(); }, delay);
  }
  function send() {
    if (run.busy) return;
    run = { i: -1, busy: false, stepMode: false, ctx: { path: state.method === 'order' ? '/api/orders' : '/api/products/1' }, failed: -1, done: false };
    $('#rlLog').innerHTML = '';
    $('#rlTag').textContent = '管线运行中';
    log('── 新请求 ' + (state.method === 'order' ? 'POST /api/orders' : 'DELETE /api/products/1') + ' ──', 'info');
    advance();
  }
  function stepOnce() {
    if (run.busy) return;
    if (run.done || run.i === -1 && !run.ctx) {
      run = { i: -1, busy: false, stepMode: true, ctx: { path: '/api/orders' }, failed: -1, done: false };
      $('#rlLog').innerHTML = '';
    }
    run.stepMode = true;
    advance();
  }

  function renderPresets() {
    $('#rlPreset').innerHTML = PRESETS[state.method].map(function (p, i) { return '<option value="' + i + '">' + p[0] + '</option>'; }).join('');
    $('#rlBody').value = PRESETS[state.method][0][1];
    $('#rlBody').disabled = state.method === 'delete';
  }
  function seg(id, key, cb) {
    $('#' + id).addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state[key] = b.dataset.v;
      Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
      if (cb) cb();
      if (sound) sound.play('tick');
    });
  }
  seg('rlMethod', 'method', renderPresets);
  seg('rlRole', 'role');
  seg('rlAccept', 'accept');
  seg('rlLogLevel', 'logLevel', function () { $('#rlLogTag').textContent = state.logLevel; });
  $('#rlPreset').addEventListener('change', function () { $('#rlBody').value = PRESETS[state.method][+this.value][1]; });
  $('#rlAuth').addEventListener('change', function () { state.auth = this.checked; });
  $('#rlRace').addEventListener('change', function () { state.race = this.checked; });
  $('#rlSlow').addEventListener('change', function () { state.slow = this.checked; });
  $('#rlStock').addEventListener('input', function () {
    state.stock3 = +this.value;
    this.style.setProperty('--fill', (this.value / 20 * 100) + '%');
    $('#rlStockOut').textContent = this.value;
    var p = db.filter(function (x) { return x.id === 3; })[0]; if (p) p.stock = state.stock3;
    renderDb();
  });
  $('#rlSpeed').addEventListener('input', function () {
    state.speed = +this.value;
    this.style.setProperty('--fill', ((this.value - 0.5) / 3.5 * 100) + '%');
    $('#rlSpeedOut').textContent = state.speed.toFixed(1) + '×';
  });
  $('#rlSend').addEventListener('click', send);
  $('#rlStep').addEventListener('click', stepOnce);
  $('#rlReset').addEventListener('click', function () {
    resetDb();
    db[2].stock = state.stock3;
    run = { i: -1, busy: false, stepMode: false, ctx: null, failed: -1, done: false };
    $('#rlLog').innerHTML = ''; $('#rlResp').textContent = ''; $('#rlStatus').innerHTML = '';
    $('#rlTag').textContent = '等待发送'; $('#rlRespTag').textContent = '—'; $('#rlElapsed').textContent = '—';
    renderDb(); renderTrack();
    if (sound) sound.play('close');
  });

  $('#rlStock').style.setProperty('--fill', '10%');
  $('#rlSpeed').style.setProperty('--fill', '14%');
  renderPresets(); renderDb(); renderTrack();
})();