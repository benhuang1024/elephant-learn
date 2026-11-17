/* 语法高亮：Node 构建期与浏览器共用（UMD，file:// 下用经典 script 加载） */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HL = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var KW = {
    js: 'const let var function return if else for while do break continue switch case default try catch finally throw new class extends super this typeof instanceof in of delete void yield async await static get set export import from as with debugger'.split(' '),
    tsExtra: 'interface type enum implements namespace declare abstract readonly public private protected keyof infer satisfies is out override unique symbol never unknown any'.split(' '),
    php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield'.split(' '),
    java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public record return sealed short static strictfp super switch synchronized this throw throws transient try var void volatile while yield permits'.split(' '),
    py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda match case nonlocal not or pass raise return try while with yield'.split(' '),
    sql: 'select from where insert into values update set delete create table alter drop index primary key foreign references not null default unique check constraint join left right inner outer full on group by order having limit offset union all distinct as and or in exists between like is asc desc begin commit rollback transaction with returning cascade if'.split(' '),
    bash: 'if then else elif fi for while do done case esac function in select time until return break continue local export readonly declare set unset shift trap eval exec source alias'.split(' '),
    yaml: 'true false null yes no on off'.split(' '),
    toml: 'true false'.split(' ')
  };

  var LITERAL = {
    js: 'true false null undefined NaN Infinity globalThis window document console process module exports require Promise Array Object JSON Math Number String Boolean Map Set Date Error RegExp Symbol'.split(' '),
    ts: 'string number boolean object symbol bigint any unknown never void undefined null'.split(' '),
    php: 'true false null TRUE FALSE NULL int float string bool array object mixed void never iterable callable self static parent'.split(' '),
    java: 'true false null String Integer Long Double Float Boolean Object List Map Set Optional BigDecimal LocalDateTime Instant Override Deprecated FunctionalInterface'.split(' '),
    py: 'True False None int float str bool list dict set tuple bytes object Optional Union List Dict Any Callable self cls'.split(' ')
  };

  function words(list) {
    var seen = {};
    return list.filter(function (w) { if (seen[w]) return false; seen[w] = 1; return true; })
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
  }

  function cfg(o) {
    var base = {
      line: null, block: null, strings: ['"', "'"], triple: false, template: false,
      keywords: [], literals: [], caseInsensitive: false,
      variable: null, decorator: null, flag: false, key: false, tag: false, heredoc: false
    };
    for (var k in o) base[k] = o[k];
    return base;
  }

  var LANGS = {
    js: cfg({ line: '//', block: ['/*', '*/'], template: true, keywords: KW.js, literals: LITERAL.js, decorator: '@' }),
    ts: cfg({ line: '//', block: ['/*', '*/'], template: true, keywords: KW.js.concat(KW.tsExtra), literals: LITERAL.js.concat(LITERAL.ts), decorator: '@' }),
    php: cfg({ line: '//', block: ['/*', '*/'], keywords: KW.php, literals: LITERAL.php, variable: '$', heredoc: true, decorator: '#[' }),
    java: cfg({ line: '//', block: ['/*', '*/'], keywords: KW.java, literals: LITERAL.java, decorator: '@' }),
    python: cfg({ line: '#', triple: true, keywords: KW.py, literals: LITERAL.py, decorator: '@' }),
    sql: cfg({ line: '--', block: ['/*', '*/'], strings: ["'", '"'], keywords: KW.sql, caseInsensitive: true }),
    bash: cfg({ line: '#', keywords: KW.bash, variable: '$', flag: true }),
    yaml: cfg({ line: '#', keywords: KW.yaml, key: true }),
    json: cfg({ strings: ['"'], keywords: ['true', 'false', 'null'], key: true }),
    toml: cfg({ line: '#', keywords: KW.toml, key: true }),
    ini: cfg({ line: ';', key: true }),
    dockerfile: cfg({ line: '#', keywords: 'FROM RUN CMD LABEL EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD STOPSIGNAL HEALTHCHECK SHELL AS'.split(' '), variable: '$' }),
    nginx: cfg({ line: '#', keywords: 'server location listen server_name root index proxy_pass fastcgi_pass include upstream error_log access_log return rewrite try_files set if worker_processes events http'.split(' '), variable: '$' }),
    xml: cfg({ block: ['<!--', '-->'], tag: true }),
    html: cfg({ block: ['<!--', '-->'], tag: true }),
    vue: cfg({ block: ['<!--', '-->'], tag: true }),
    markdown: cfg({}), text: cfg({}), diff: cfg({})
  };

  var ALIAS = {
    javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
    typescript: 'ts', tsx: 'ts', jsonc: 'json', json5: 'json',
    py: 'python', python3: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
    yml: 'yaml', htm: 'html', svg: 'xml', pom: 'xml',
    docker: 'dockerfile', gitignore: 'text', env: 'bash', dotenv: 'bash', properties: 'ini', conf: 'nginx',
    plaintext: 'text', txt: 'text', output: 'text', log: 'text', tree: 'text', mermaid: 'text'
  };

  function normalize(lang) {
    var l = String(lang || '').toLowerCase().trim();
    if (LANGS[l]) return l;
    return ALIAS[l] || 'text';
  }

  function span(cls, text) { return '<span class="t-' + cls + '">' + esc(text) + '</span>'; }

  function highlight(code, lang) {
    var name = normalize(lang);
    var c = LANGS[name];
    var src = String(code == null ? '' : code).replace(/\r\n?/g, '\n');
    if (name === 'text' || name === 'markdown') return esc(src);
    if (name === 'diff') {
      return src.split('\n').map(function (ln) {
        if (/^\+\+\+|^---/.test(ln)) return span('meta', ln);
        if (ln.charAt(0) === '+') return span('add', ln);
        if (ln.charAt(0) === '-') return span('del', ln);
        if (ln.charAt(0) === '@') return span('dec', ln);
        return esc(ln);
      }).join('\n');
    }

    var kwRe = c.keywords.length ? new RegExp('^(?:' + words(c.keywords) + ')\\b', c.caseInsensitive ? 'i' : '') : null;
    var litRe = c.literals.length ? new RegExp('^(?:' + words(c.literals) + ')\\b') : null;
    var out = '', i = 0, n = src.length, m;

    while (i < n) {
      var ch = src.charAt(i);
      var tail = src.slice(i);

      if (ch === '\n') { out += '\n'; i++; continue; }
      if (ch === ' ' || ch === '\t') { m = /^[ \t]+/.exec(tail); out += esc(m[0]); i += m[0].length; continue; }

      if (c.line && tail.indexOf(c.line) === 0 && !(name === 'php' && tail.charAt(1) === '[')) {
        m = /^[^\n]*/.exec(tail); out += span('com', m[0]); i += m[0].length; continue;
      }
      if (c.block && tail.indexOf(c.block[0]) === 0) {
        var end = src.indexOf(c.block[1], i + c.block[0].length);
        var stop = end === -1 ? n : end + c.block[1].length;
        out += span('com', src.slice(i, stop)); i = stop; continue;
      }
      if (c.triple && (tail.indexOf('"""') === 0 || tail.indexOf("'''") === 0)) {
        var q3 = tail.slice(0, 3), e3 = src.indexOf(q3, i + 3);
        var s3 = e3 === -1 ? n : e3 + 3;
        out += span('str', src.slice(i, s3)); i = s3; continue;
      }
      if (c.strings.indexOf(ch) >= 0) {
        var j = i + 1, buf = ch;
        while (j < n) {
          if (src.charAt(j) === '\\') { buf += src.slice(j, j + 2); j += 2; continue; }
          if (src.charAt(j) === ch) { buf += ch; j++; break; }
          if (src.charAt(j) === '\n') break;
          buf += src.charAt(j); j++;
        }
        var isKey = c.key && /^\s*:/.test(src.slice(j));
        out += span(isKey ? 'key' : 'str', buf); i = j; continue;
      }
      if (c.template && ch === '`') {
        var k = i + 1, tbuf = '`';
        while (k < n) {
          if (src.charAt(k) === '\\') { tbuf += src.slice(k, k + 2); k += 2; continue; }
          if (src.charAt(k) === '`') { tbuf += '`'; k++; break; }
          tbuf += src.charAt(k); k++;
        }
        out += span('str', tbuf); i = k; continue;
      }
      if (c.heredoc && (m = /^<<<(['"]?)([A-Z_][A-Z0-9_]*)\1\r?\n/.exec(tail))) {
        var label = m[2], close = src.indexOf('\n' + label, i + m[0].length);
        var hstop = close === -1 ? n : close + label.length + 1;
        out += span('str', src.slice(i, hstop)); i = hstop; continue;
      }
      if (c.variable && ch === c.variable) {
        m = name === 'bash'
          ? /^\$(?:\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/.exec(tail)
          : /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(tail);
        if (m) { out += span('var', m[0]); i += m[0].length; continue; }
      }
      if (c.decorator && tail.indexOf(c.decorator) === 0) {
        m = name === 'php' ? /^#\[[^\]\n]*\]?/.exec(tail) : /^@[A-Za-z_][A-Za-z0-9_.]*/.exec(tail);
        if (m) { out += span('dec', m[0]); i += m[0].length; continue; }
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src.charAt(i + 1)))) {
        m = /^(?:0[xXbBoO][0-9a-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]+)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)(?![A-Za-z_])/.exec(tail);
        if (m) { out += span('num', m[0]); i += m[0].length; continue; }
      }
      if (c.tag && ch === '<' && /^<\/?[A-Za-z!]/.test(tail)) {
        m = /^<\/?[A-Za-z][A-Za-z0-9:._-]*/.exec(tail);
        if (m) {
          out += span('tag', m[0]); i += m[0].length;
          var gt = src.indexOf('>', i), stopTag = gt === -1 ? n : gt;
          out += src.slice(i, stopTag).replace(/("[^"]*"|'[^']*')|([A-Za-z_:@][A-Za-z0-9_:.-]*)|(\s+)|([\s\S])/g,
            function (all, str, attr, ws, other) {
              if (str) return span('str', str);
              if (attr) return span('attr', attr);
              if (ws) return ws;
              return esc(other);
            });
          i = stopTag;
          if (src.charAt(i) === '>') { out += span('tag', '>'); i++; }
          continue;
        }
      }
      if (/[A-Za-z_$]/.test(ch) || ch.charCodeAt(0) > 127) {
        m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(tail);
        if (!m) { out += esc(ch); i++; continue; }
        var w = m[0], after = src.slice(i + w.length);
        var cls = null;
        if (c.key && /^\s*:/.test(after) && (name === 'yaml' || name === 'toml' || name === 'ini')) cls = 'key';
        else if (kwRe && kwRe.test(w)) cls = 'kw';
        else if (litRe && litRe.test(w)) cls = 'lit';
        else if (/^\s*\(/.test(after) && !/^(if|for|while|switch|catch|return|function|def|class|new|typeof|instanceof|match|print|echo|isset|unset|empty|array|list|dict|set|tuple|len|range|super)$/.test(w)) cls = 'fn';
        else if (/^[A-Z][A-Za-z0-9_]*$/.test(w) && name !== 'bash') cls = 'typ';
        out += cls ? span(cls, w) : esc(w);
        i += w.length; continue;
      }
      if (c.flag && ch === '-' && /^--?[A-Za-z]/.test(tail)) {
        m = /^--?[A-Za-z][A-Za-z0-9-]*/.exec(tail);
        out += span('attr', m[0]); i += m[0].length; continue;
      }
      if (/[{}[\]()<>;,.:]/.test(ch)) { out += span('punc', ch); i++; continue; }
      if (/[+\-*/%=!&|^~?@#]/.test(ch)) {
        m = /^[+\-*/%=!&|^~?@#]+/.exec(tail);
        out += span('op', m[0]); i += m[0].length; continue;
      }
      out += esc(ch); i++;
    }
    return out;
  }

  function label(lang) {
    var name = normalize(lang);
    var map = {
      js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', php: 'PHP', java: 'Java', python: 'Python',
      sql: 'SQL', bash: 'Shell', yaml: 'YAML', json: 'JSON', toml: 'TOML', ini: 'INI',
      dockerfile: 'Dockerfile', nginx: 'nginx', xml: 'XML', html: 'HTML', vue: 'Vue',
      diff: 'Diff', text: 'TEXT', markdown: 'Markdown'
    };
    return map[name] || name.toUpperCase();
  }

  return { highlight: highlight, normalize: normalize, label: label, escape: esc };
});