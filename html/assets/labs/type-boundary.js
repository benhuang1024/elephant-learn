/* 类型擦除与边界校验：跑仓库 @shop/shared 的真实 zod schema */
(function () {
  'use strict';
  var S = window.SHARED;
  var $ = function (s) { return document.querySelector(s); };
  var sound = window.ELSound;
  if (!S) { $('#tbResult').innerHTML = '<div class="tb-err"><span class="msg">共享契约包未加载</span></div>'; return; }
  var z = S.z;

  var PRESETS = {
    order: [
      ['合法下单', { customerName: 'ben', items: [{ productId: 1, quantity: 2 }] }],
      ['缺 customerName', { items: [{ productId: 1, quantity: 2 }] }],
      ['quantity 超 99', { customerName: 'ben', items: [{ productId: 1, quantity: 100 }] }],
      ['items 为空', { customerName: 'ben', items: [] }],
      ['quantity 是字符串', { customerName: 'ben', items: [{ productId: 1, quantity: '2' }] }],
      ['嵌套路径错 items[1]', { customerName: 'ben', items: [{ productId: 1, quantity: 1 }, { productId: -3, quantity: 0 }] }],
      ['多余字段 isAdmin', { customerName: 'ben', isAdmin: true, items: [{ productId: 1, quantity: 1 }] }]
    ],
    product: [
      ['合法建商品', { sku: 'SKU-100', name: '显示器', price: 1999.00, stock: 3 }],
      ['缺 sku', { name: '显示器', price: 1999.00, stock: 3 }],
      ['price 浮点尾巴', { sku: 'SKU-100', name: '显示器', price: 19.999, stock: 3 }],
      ['price 为 0', { sku: 'SKU-100', name: '显示器', price: 0, stock: 3 }],
      ['stock 负数', { sku: 'SKU-100', name: '显示器', price: 1999.00, stock: -1 }],
      ['缺 stock（看 default）', { sku: 'SKU-100', name: '显示器', price: 1999.00 }],
      ['多余字段', { sku: 'SKU-100', name: '显示器', price: 1999.00, stock: 3, hack: 1 }]
    ],
    query: [
      ['合法 q', { q: '键盘' }],
      ['q 是数字', { q: 123 }],
      ['空白 q（视为不过滤）', { q: '   ' }],
      ['多余字段', { q: '键盘', page: 2 }]
    ]
  };
  var TYPES = {
    order: ['interface PlaceOrderRequest {', '  customerName: string;', '  items: OrderLineRequest[];', '}', 'interface OrderLineRequest {', '  productId: number;', '  quantity: number;', '}'],
    product: ['interface CreateProductRequest {', '  sku: string;', '  name: string;', '  price: DecimalAmount;', '  stock?: number;', '}'],
    query: ['interface ProductQuery {', '  q?: string;', '}']
  };
  var state = { schema: 'order', unknown: 'strip', coerce: false, def: true, runtime: true, infer: true };

  function schema() {
    var base = state.schema === 'order' ? S.PlaceOrderRequestSchema : state.schema === 'product' ? S.CreateProductRequestSchema : S.ProductQuerySchema;
    if (state.schema === 'product' && !state.def) base = base.extend({ stock: z.int().min(0, '必须大于或等于 0') });
    if (state.unknown === 'strict') base = base.strict();
    else if (state.unknown === 'pass') base = base.passthrough();
    else base = base.strip();
    return base;
  }
  function coercePayload(p) {
    if (!state.coerce || typeof p !== 'object' || !p) return p;
    var c = JSON.parse(JSON.stringify(p));
    if (Array.isArray(c.items)) c.items.forEach(function (it) { if (it && typeof it.quantity === 'string' && it.quantity.trim() !== '' && !isNaN(+it.quantity)) it.quantity = +it.quantity; if (it && typeof it.productId === 'string' && !isNaN(+it.productId)) it.productId = +it.productId; });
    if (typeof c.stock === 'string' && !isNaN(+c.stock)) c.stock = +c.stock;
    if (typeof c.q === 'number') c.q = String(c.q);
    return c;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pretty(o) { return JSON.stringify(o, null, 2); }

  function renderPresets() {
    $('#tbPresets').innerHTML = PRESETS[state.schema].map(function (p, i) {
      return '<button type="button" data-i="' + i + '" style="flex:1 1 100%;text-align:left">' + p[0] + '</button>';
    }).join('');
  }
  function loadPreset(i) {
    $('#tbPayload').value = pretty(PRESETS[state.schema][i][1]);
    run();
  }

  function renderType() {
    var lines = TYPES[state.schema].slice();
    var html = lines.map(function (ln) {
      if (!state.runtime) return '<div>' + esc(ln) + '</div>';
      var m = /^(\s*[\w?]+:\s*)(.+?)(;?)$/.exec(ln);
      if (m) return '<div>' + esc(m[1]) + '<span class="erased">' + esc(m[2]) + '</span>' + esc(m[3]) + '  <span style="color:var(--danger);font-size:10.5px">运行时不存在</span></div>';
      return '<div>' + esc(ln) + '</div>';
    }).join('');
    html += '<div style="margin-top:8px">const body = JSON.parse(raw) <span class="' + (state.runtime ? 'erased' : '') + '">as ' + (state.schema === 'order' ? 'PlaceOrderRequest' : state.schema === 'product' ? 'CreateProductRequest' : 'ProductQuery') + '</span>;</div>';
    if (state.infer) html += '<div style="margin-top:8px;color:var(--ta)">type Input = z.infer&lt;typeof Schema&gt;;  <span style="color:var(--text3)">// 类型从 schema 推导，不是手写两份</span></div>';
    $('#tbTypeView').innerHTML = html;
    $('#tbEraseNote').textContent = state.runtime
      ? '划掉的部分在编译后一个字节都不剩。JSON.parse 返回的是 any：字段缺失、类型错、多余字段，编译器一律沉默。'
      : '这是编译期的样子：一切都有类型。但 tsc 只做检查，不做运行时守卫——把开关切到「运行时视角」看真相。';
  }

  function run() {
    var raw = $('#tbPayload').value;
    var payload, parseOk = true;
    try { payload = JSON.parse(raw); } catch (e) { parseOk = false; payload = null; }
    $('#tbParseState').innerHTML = parseOk
      ? '<span style="color:var(--success)">JSON.parse 成功</span> · 注意：parse 成功 ≠ 形状合法'
      : '<span style="color:var(--danger)">JSON.parse 失败：' + esc(e.message) + '</span> · 这一层连 Zod 都到不了';
    $('#tbSchemaTag').textContent = state.schema === 'order' ? 'PlaceOrderRequest' : state.schema === 'product' ? 'CreateProductRequest' : 'ProductQuery';
    renderType();
    if (!parseOk) {
      $('#tbResult').innerHTML = '<div class="tb-err"><span class="path">body</span><span class="msg">不是合法 JSON，框架在反序列化阶段就 400 了。</span></div>';
      $('#tbProblem').textContent = 'HTTP/1.1 400 Bad Request\nContent-Type: application/problem+json\n\n' + pretty({ title: '非法请求', status: 400, detail: '请求体不是合法 JSON' });
      $('#tbStatus').textContent = 'PARSE ERR'; $('#tbStatusBox').className = 'readout bad'; $('#tbErrCount').textContent = '1';
      $('#tbResultTag').textContent = 'safeParse 未执行';
      return;
    }
    var res = schema().safeParse(coercePayload(payload));
    if (res.success) {
      $('#tbResult').innerHTML = '<div class="tb-ok">success: true · 得到规范化后的 DTO（trim / default / 丢弃未知字段已生效）</div>' +
        '<div class="console" style="margin-top:10px;max-height:220px">' + esc(pretty(res.data)) + '</div>';
      $('#tbStatus').textContent = 'PASS'; $('#tbStatusBox').className = 'readout ok'; $('#tbErrCount').textContent = '0';
      $('#tbResultTag').textContent = 'success';
      var status = state.schema === 'query' ? 200 : 201;
      var head = 'HTTP/1.1 ' + status + (status === 201 ? ' Created' : ' OK') + '\nContent-Type: application/json\n' + (status === 201 ? 'Location: /api/' + (state.schema === 'order' ? 'orders' : 'products') + '/1\n' : '') + '\n';
      $('#tbProblem').textContent = head + pretty(res.data);
      if (sound) sound.play('ok');
    } else {
      var errs = S.toFieldErrors(res.error);
      var keys = Object.keys(errs);
      $('#tbResult').innerHTML = keys.map(function (k) {
        return '<div class="tb-err"><span class="path">' + esc(k) + '</span><span class="msg">' + esc(errs[k]) + '</span></div>';
      }).join('') + '<div class="ctrl-hint">共 ' + res.error.issues.length + ' 条 issue，拍平成 ' + keys.length + ' 个字段键（同字段保留第一条，与 Java putIfAbsent 一致）。</div>';
      $('#tbStatus').textContent = 'FAIL'; $('#tbStatusBox').className = 'readout bad'; $('#tbErrCount').textContent = keys.length;
      $('#tbResultTag').textContent = 'ZodError';
      $('#tbProblem').textContent = 'HTTP/1.1 400 Bad Request\nContent-Type: application/problem+json\n\n' + pretty(S.validationProblem(errs));
      if (sound) sound.play('err');
    }
    renderMoney();
  }

  function renderMoney() {
    var f = 0.1 + 0.2;
    $('#tbFloat').textContent = String(f).slice(0, 10);
    var a = S.parseDecimal('0.1'), b = S.parseDecimal('0.2');
    var sum = S.addDecimal(a, b);
    $('#tbCents').textContent = S.decimalToCents(sum);
    $('#tbMoney').textContent =
      '0.1 + 0.2 === 0.3            → ' + (f === 0.3) + '\n' +
      'JSON.stringify(599.00)       → ' + JSON.stringify(599.00) + '   （scale 丢了）\n' +
      'parseDecimal("599.00")       → ' + S.parseDecimal('599.00') + '\n' +
      'decimalToCents("599.00")     → ' + S.decimalToCents(S.parseDecimal('599.00')) + '\n' +
      'addDecimal("0.1","0.2")      → ' + sum + '   （整数分：精确）\n' +
      'multiplyDecimalByInt ×2      → ' + S.multiplyDecimalByInt(S.parseDecimal('599.00'), 2);
  }

  $('#tbSchema').addEventListener('change', function () { state.schema = this.value; renderPresets(); loadPreset(0); if (sound) sound.play('step'); });
  $('#tbPresets').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    loadPreset(+b.dataset.i); if (sound) sound.play('tick');
  });
  $('#tbUnknown').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.unknown = b.dataset.v;
    Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
    run();
  });
  $('#tbCoerce').addEventListener('change', function () { state.coerce = this.checked; run(); });
  $('#tbDefault').addEventListener('change', function () { state.def = this.checked; run(); });
  $('#tbRuntime').addEventListener('change', function () { state.runtime = this.checked; run(); });
  $('#tbInfer').addEventListener('change', function () { state.infer = this.checked; run(); });
  $('#tbPayload').addEventListener('input', function () { clearTimeout(this._t); this._t = setTimeout(run, 260); });
  $('#tbReset').addEventListener('click', function () { loadPreset(0); });
  $('#tbCopy').addEventListener('click', function () {
    var txt = $('#tbProblem').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { window.ELToast('已复制 problem+json', 'ok'); });
    if (sound) sound.play('ok');
  });
  $('#tbExport').addEventListener('click', function () {
    var payload = { schema: state.schema, unknown: state.unknown, coerce: state.coerce, defaults: state.def, input: $('#tbPayload').value, result: $('#tbResult').innerText, problem: $('#tbProblem').textContent };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'boundary-report.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    window.ELToast('已导出校验报告', 'ok');
  });

  renderPresets();
  loadPreset(0);
})();