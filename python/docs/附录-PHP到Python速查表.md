# 附录 PHP → Python 速查表

> 一页纸备查。语法、内置函数、生态、命令、常见坑。
> 配套代码：[lang-basics](../code/lang-basics)、[shop-api](../code/shop-api)、[django-shop](../code/django-shop)

## 1. 语法对照

| PHP | Python |
|---|---|
| `<?php ... ?>` | 不需要标签 |
| `$x = 1;` | `x = 1` |
| `const X = 1;` | `X = 1`（约定大写） |
| `function f($a) {}` | `def f(a):` |
| `fn ($x) => $x * 2` | `lambda x: x * 2` |
| `if (...) {} elseif {} else {}` | `if ...:` / `elif ...:` / `else:` |
| `for ($i=0; $i<n; $i++)` | `for i in range(n):` |
| `foreach ($a as $k => $v)` | `for k, v in a.items():` |
| `while (...) {}` | `while ...:` |
| `switch/case` | `match/case`（3.10+） |
| `break; continue;` | 同 |
| `return $x;` | `return x` |
| `null` | `None` |
| `true/false` | `True/False` |
| `&& | !` | `and or not`（也可 `&& || !`） |
| `.` 字符串拼接 | `+`（少量）或 f-string |
| `===` | `is`（同一对象）；值相等用 `==` |
| `[]` / `array()` | `[]` / `list()` |
| `['k' => 1]` | `{"k": 1}` |
| `new Foo()` | `Foo()` |
| `$this->x` | `self.x` |
| `Foo::bar()` | `Foo.bar()` / `@staticmethod` |
| `interface` | `Protocol` / `ABC` |
| `trait` | mixin 多继承 / 组合 |
| `enum X: string` | `class X(StrEnum)` |
| `try/catch/finally` | `try/except/finally` |
| `throw new E()` | `raise E()` |
| `@annotation` | 装饰器 `@decorator` |
| `#[Attribute]` | 装饰器/元类/`Annotated` |
| `?->` | `obj.attr if obj else None`（或 `getattr`） |
| `??` | `a if a is not None else b`（`or` 会把 0/"" 当假） |

## 2. 内置类型与操作

| 目的 | Python |
|---|---|
| 数组长度 | `len(x)` |
| 追加 | `x.append(v)`（返回 None） |
| 合并 list | `a + b` / `a.extend(b)` |
| 排序（新） | `sorted(x, key=..., reverse=True)` |
| 排序（原地） | `x.sort(...)` |
| 反转 | `x[::-1]` / `list(reversed(x))` |
| 切片 | `x[start:stop:step]` |
| 去重保序 | `list(dict.fromkeys(x))` |
| 包含 | `v in x`（list O(n)，set O(1)） |
| 映射 | `{k: f(v) for k, v in d.items()}` |
| 合并 dict | `a | b`（3.9+） |
| 取默认 | `d.get(k, default)` / `d.setdefault(k, [])` |
| 计数 | `collections.Counter(x)` |
| 分组 | `collections.defaultdict(list)` |
| 队列 | `collections.deque` |
| 堆 | `heapq` |
| 枚举 | `for i, v in enumerate(x):` |
| 并行遍历 | `for a, b in zip(x, y, strict=True):` |
| 解包 | `first, *rest = x` |
| 交换 | `a, b = b, a` |
| 三元 | `a if cond else b` |
| 空值合并 | `a if a is not None else b` |

## 3. array_* ↔ Python

| PHP | Python |
|---|---|
| `array_map` | `[f(x) for x in a]` / `map` |
| `array_filter` | `[x for x in a if p(x)]` |
| `array_reduce` | `functools.reduce` / 循环 |
| `array_sum` | `sum(a)` |
| `array_product` | `math.prod(a)` |
| `array_column` | `[r[k] for r in rows]` |
| `array_column(..., null, key)` | `{r[k]: r for r in rows}` |
| `array_keys` | `list(d)` |
| `array_values` | `list(d.values())` |
| `array_merge` | `a + b` / `{**a, **b}` |
| `array_intersect` | `set(a) & set(b)` |
| `array_diff` | `set(a) - set(b)` |
| `array_unique` | `dict.fromkeys` |
| `in_array` | `v in a` |
| `array_search` | `a.index(v)`（list）/ 反向 dict |
| `array_slice` | `a[start:stop]` |
| `array_splice` | `del a[i:j]` |
| `array_push` | `a.append` / `a.extend` |
| `array_pop` | `a.pop()` |
| `array_shift` | `a.pop(0)`（O(n)；大量用 deque） |
| `array_unshift` | `a.insert(0, v)`（O(n)） |
| `count` | `len` |
| `isEmpty` | `not a` |
| `sort` | `a.sort()` / `sorted(a)` |
| `usort` | `sorted(a, key=...)` |
| `ksort` | `dict(sorted(d.items()))` |
| `array_flip` | `{v: k for k, v in d.items()}` |
| `range` | `range` / `list(range(...))` |
| `array_fill` | `[v] * n`（可变对象慎用） |
| `array_combine` | `dict(zip(keys, values, strict=True))` |

## 4. 字符串

| PHP | Python |
|---|---|
| `strlen` | `len(s)` |
| `str_contains` | `sub in s` |
| `str_starts_with` / `ends_with` | `s.startswith` / `endswith` |
| `strtolower` / `strtoupper` | `s.lower()` / `s.upper()` |
| `trim` | `s.strip()` |
| `explode` | `s.split(sep)` |
| `implode` | `sep.join(items)` |
| `substr` | `s[start:stop]` |
| `str_replace` | `s.replace(a, b)` |
| `sprintf` | f-string / `format` |
| `preg_match` | `re.search` |
| `preg_replace` | `re.sub` |
| `nl2br` | 模板层处理 |
| `htmlspecialchars` | `html.escape` / 模板自动转义 |
| `json_encode` | `json.dumps` |
| `json_decode` | `json.loads` |
| `urlencode` | `urllib.parse.quote` |
| `base64_encode` | `base64.b64encode` |

## 5. 面向对象

| PHP | Python |
|---|---|
| `class Foo {}` | `class Foo:` |
| `__construct` | `__init__` |
| `$this` | `self`（显式参数） |
| `parent::__construct` | `super().__init__()` |
| `public/private/protected` | `_` / `__` 约定 |
| `readonly` | `@dataclass(frozen=True)` |
| `__toString` | `__str__` / `__repr__` |
| `Countable` | `__len__` |
| `Iterator` | `__iter__` / `__next__` |
| `ArrayAccess` | `__getitem__` / `__setitem__` |
| `__invoke` | `__call__` |
| `interface` | `Protocol` / `ABC` |
| `abstract class` | `ABC` + `@abstractmethod` |
| `final` | `typing.final`（检查器） |
| `static` 属性 | 类属性 |
| `self::CONST` | `Foo.CONST` |

## 6. 异常

| PHP | Python |
|---|---|
| `try {} catch (E $e) {}` | `try: ... except E as e:` |
| `catch (A | B $e)` | `except (A, B) as e:` |
| `finally` | `finally` |
| `throw` | `raise` |
| `$e->getPrevious()` | `e.__cause__` |
| `throw X previous: $e` | `raise X from e` |
| 多个错误 | `ExceptionGroup` + `except*` |
| `error_log` | `logging` |

## 7. 生态

| 领域 | Laravel/PHP | Python |
|---|---|---|
| 框架 | Laravel/Symfony | FastAPI/Django/Flask |
| ORM | Eloquent/Doctrine | SQLAlchemy/Django ORM |
| 校验 | Validator/FormRequest | Pydantic/Marshmallow |
| 迁移 | Laravel Migrations | Alembic/Django migrations |
| 测试 | PHPUnit/Pest | pytest |
| 静态检查 | PHPStan/Psalm | mypy/pyright |
| 格式化 | Pint/PHP-CS-Fixer | ruff format/black |
| 依赖 | Composer | uv/pip |
| 队列 | Laravel Queue | Celery/RQ/arq |
| 缓存 | Laravel Cache | Redis/cachetools |
| 管理后台 | Nova/Filament | Django Admin |
| 模板 | Blade | Jinja2/Django Templates |
| HTTP 客户端 | Guzzle | httpx/requests |
| CLI | Symfony Console | argparse/click/typer |
| 日志 | Monolog | logging/structlog |
| 指标 | Prometheus PHP | prometheus_client |
| 追踪 | OpenTelemetry PHP | OpenTelemetry Python |

## 8. 命令对照

| 目的 | Laravel | FastAPI（本仓库） | Django |
|---|---|---|---|
| 装依赖 | `composer install` | `uv sync` | `uv sync` |
| 加依赖 | `composer require x` | `uv add x` | `uv add x` |
| 开发服务 | `php artisan serve` | `uv run uvicorn shop.main:app --reload` | `uv run python manage.py runserver` |
| 迁移 | `php artisan migrate` | `uv run alembic upgrade head` | `uv run python manage.py migrate` |
| 生成迁移 | `make:migration` | `uv run alembic revision --autogenerate -m "..."` | `uv run python manage.py makemigrations` |
| 回滚 | `migrate:rollback` | `uv run alembic downgrade -1` | `uv run python manage.py migrate app 0001` |
| 种子 | `db:seed` | 启动时 seed / 自定义脚本 | `uv run python manage.py seed_demo` |
| REPL | `php artisan tinker` | `uv run python` | `uv run python manage.py shell` |
| 路由列表 | `route:list` | `/openapi.json` | `uv run python manage.py show_urls`（需扩展） |
| 测试 | `php artisan test` | `uv run pytest` | `uv run pytest` |
| 静态检查 | `phpstan analyse` | `uv run mypy src` | 未强制 |
| 格式化 | `pint` | `uv run ruff format` | `uv run ruff format` |
| 打包 | `composer archive` | `uv build` | 通常不打包 |

## 9. 常见坑速查

| 坑 | 说明 |
|---|---|
| 可变默认参数 | `def f(x=[])` 共享；用 `None` + 新建 |
| 赋值是引用 | `b = a` 后修改 `b` 影响 `a`；要拷贝 |
| `is` 比字符串/数字 | 用 `==`；`is` 只用于 None/哨兵 |
| 浮点金额 | 用 `Decimal`，入参用字符串 |
| `"0"` 是真值 | 与 PHP 不同 |
| `[] == False` | 为 False |
| `append` 返回 None | 不要链式调用 |
| 遍历 dict 时增删 | 先复制键 |
| `sort()` 返回 None | 用 `sorted()` |
| 切片是浅拷贝 | 嵌套对象仍共享 |
| 闭包晚绑定 | 循环里用默认参数绑定 |
| `except Exception` 吞错 | 精确捕获并保留 `from` |
| `except*` 里 return | 不允许 |
| 生成器只能消费一次 | 需要重复就重建 |
| `async def` 里阻塞 | 卡死事件循环 |
| GIL | CPU 密集用进程/独立服务 |
| 模块级可变状态 | 常驻进程会跨请求共享 |
| Session 跨请求 | 数据串/连接泄漏 |
| 忘记 commit | 数据不落库 |
| commit 后懒加载 | DetachedInstanceError |
| N+1 | `selectinload` |
| `create_all` 上生产 | 用迁移 |
| `python src/...py` | 用 `python -m` 或 `uv run` |
| 裸 `python` 不存在 | 用 `uv run python` / `python3` |
| 生产 `--reload` | 只在开发用 |
| CORS `*` + credentials | 浏览器拒绝 |
| 日志打印秘密 | 脱敏 |
| 对象级越权 | 查询带用户/租户范围 |
| Testcontainers 跳过 | CI 检查 skip 数 |

## 10. 最小命令集

```bash
# 语言工程
cd python/code/lang-basics
uv sync
uv run pytest
uv run mypy src
uv run ruff check
uv run scripts/hello.py

# FastAPI
cd python/code/shop-api
uv sync
uv run alembic upgrade head
uv run pytest
uv run uvicorn shop.main:app --port 8000

# Django
cd python/code/django-shop
uv sync
uv run python manage.py migrate
uv run python manage.py seed_demo
uv run pytest
uv run python manage.py runserver 8000
```

## 11. 一页记忆

```
缩进即块        None 即 null       list/dict 引用语义
== 比值         is 比身份          Decimal 存钱
推导式代替 array_*                生成器默认惰性
异常有因果链    with 管资源        Protocol 结构化接口
mypy 管静态     Pydantic 管边界    uv 管依赖
Session 是工作单元，不是连接       N+1 用 selectinload
常驻进程：无全局状态、连接池、优雅退出
同步端点别写 async；异步端点别阻塞
```
