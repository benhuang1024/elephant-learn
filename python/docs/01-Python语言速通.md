# 01 Python 语言速通

> **配套代码（lang-basics）**
> 真值与相等：[truthiness_and_equality.py](../code/lang-basics/src/basics/truthiness_and_equality.py)
> 集合与 array_*：[collections_vs_array.py](../code/lang-basics/src/basics/collections_vs_array.py)
> 可变默认参数/引用：[mutable_defaults.py](../code/lang-basics/src/basics/mutable_defaults.py)
> 金额值对象：[money.py](../code/lang-basics/src/basics/money.py)
> 装饰器：[decorators.py](../code/lang-basics/src/basics/decorators.py)
> 测试就是可执行笔记：`tests/test_truthiness_and_equality.py` 等

这一章不讲变量是什么，只讲 **PHP 直觉会出错的地方**。所有示例都可以在 `code/lang-basics` 里运行。

## 1. 缩进是语法，不是风格

```python
def price_with_tax(amount: float, rate: float) -> float:
    if amount <= 0:
        raise ValueError("金额必须大于 0")
    return amount * (1 + rate)
```

- 冒号 + 缩进定义块，没有 `{}`。
- 空块用 `pass`。
- 团队统一 4 空格；混合 Tab 会直接 `TabError`。
- `ruff format` 与编辑器格式化能消除争议。

## 2. 动态类型，但强类型

PHP 8 也在变强，但 Python 的默认行为更“较真”：

```python
"1" + 1        # TypeError
1 == "1"       # False
[] == False    # False（PHP 里为 true）
0 == False     # True
"0"            # 真值（PHP 里为假）
```

| 值 | PHP `if ($v)` | Python `if v:` |
|---|---|---|
| `0` / `0.0` | 假 | 假 |
| `"0"` | **假** | **真** |
| `""` | 假 | 假 |
| `[]` / `{}` | 假 | 假 |
| `null` / `None` | 假 | 假 |
| 非空字符串 | 真 | 真 |

写业务判断时不要依赖类型转换，显式比较：

```python
if stock == 0:
    ...
if not items:
    ...
```

### `==` 与 `is`

- `==`：值相等，调用 `__eq__`。
- `is`：同一对象（内存地址），只用于 `None`、`True/False` 和哨兵对象。

```python
first = [1, 2]
second = [1, 2]
first == second   # True
first is second   # False
value is None     # 正确
value == None     # 能跑，但不推荐
```

### 浮点数与金额

```python
0.1 + 0.2 == 0.3          # False
Decimal("0.1") + Decimal("0.2") == Decimal("0.3")   # True
Decimal(0.1)              # 把二进制误差带进来，不要这样
```

金额三原则：

1. 入参用字符串构造 `Decimal`：`Decimal(str(amount))` 或直接接收 `"19.90"`。
2. 在值对象里统一 `quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`。
3. 不要用 `float` 做累计，也不要在业务代码里散落 `round()`。

完整实现见 [money.py](../code/lang-basics/src/basics/money.py)：`frozen=True` 保证不可变，`__post_init__` 统一精度，`__add__/__mul__` 保持币种一致。

## 3. 集合类型：PHP 数组被拆成四种

| PHP | Python | 有序 | 可变 | 元素可重复 | 典型用途 |
|---|---|---|---|---|---|
| `array`（list 用法） | `list` | 是 | 是 | 是 | 顺序集合 |
| `array`（map 用法） | `dict` | 是（3.7+ 保证） | 是 | 键唯一 | 映射/JSON |
| — | `tuple` | 是 | 否 | 是 | 固定结构、可哈希 |
| — | `set` | 否 | 是 | 否 | 去重、集合运算 |
| — | `frozenset` | 否 | 否 | 否 | 可哈希的集合 |

```python
product = {"sku": "SKU-001", "price_cents": 59900}   # dict
skus = ("SKU-001", "SKU-002")                         # tuple
tags = {"keyboard", "office"}                         # set
```

`dict` 保持插入顺序，这一点和 PHP 关联数组一致：

```python
mapping = {"b": 2, "a": 1}
mapping["c"] = 3
list(mapping)          # ['b', 'a', 'c']
```

### 切片与解包

```python
items = ["a", "b", "c", "d"]
items[0]        # 'a'
items[-1]       # 'd'
items[1:3]      # ['b', 'c']
items[::2]      # ['a', 'c']
items[::-1]     # 反转
first, *middle, last = items     # a ['b','c'] d
```

字符串、list、tuple 都支持切片；切片产生新对象（浅拷贝）。

## 4. `array_*` 的替代品

| PHP | Python |
|---|---|
| `array_map(fn, $a)` | `[f(x) for x in a]` / `map(f, a)` |
| `array_filter($a, fn)` | `[x for x in a if cond(x)]` |
| `array_column($rows, 'name')` | `[r["name"] for r in rows]` |
| `array_column($rows, null, 'sku')` | `{r["sku"]: r for r in rows}` |
| `array_sum(array_map(...))` | `sum(...)` |
| `array_reduce` | `functools.reduce`（多数场景用 sum/min/max/any/all） |
| `usort($a, cmp)` | `sorted(a, key=...)` |
| `array_count_values` | `collections.Counter` |
| `array_unique` | `list(dict.fromkeys(values))` |
| `in_array($x, $a, true)` | `x in a` |
| `array_keys($a)` | `list(a)` / `a.keys()` |
| `array_values($a)` | `list(a.values())` |
| `array_merge` | `a | b`（dict）或 `a + b`（list） |

注意：

- `sorted` 返回新 list；`list.sort()` 原地排序并返回 `None`。
- `sorted(rows, key=lambda r: r["price"])` 是稳定排序。
- 生成器表达式 `sum(x for x in xs)` 不建中间 list，处理大文件时优先。

完整的 TypedDict 版本见 [collections_vs_array.py](../code/lang-basics/src/basics/collections_vs_array.py)。

## 5. 字符串

```python
name = "ben"
f"Hello {name}, total={total:.2f}"     # f-string，推荐
"{} + {}".format(1, 2)                  # 旧写法，维护老代码会见到
"a" * 3                                 # 'aaa'
",".join(["a", "b"])                    # 'a,b'
"  x  ".strip()
"SKU-001".startswith("SKU-")
"a,b,c".split(",")
```

- 字符串不可变；`s.upper()` 返回新字符串。
- 大量拼接用 `"".join(parts)`，不要 `+=` 循环。
- 多行文本用三引号，注意会保留缩进，可用 `textwrap.dedent`。

## 6. 函数

```python
def create_product(
    sku: str,
    name: str,
    *,
    price: Decimal,
    stock: int = 0,
) -> Product:
    ...
```

| 语法 | 含义 | PHP 类比 |
|---|---|---|
| `def f(a, b)` | 位置参数 | 普通参数 |
| `def f(*, a)` | 仅关键字参数 | 无直接对应 |
| `def f(*args)` | 可变位置参数（tuple） | `...$args` |
| `def f(**kwargs)` | 可变关键字参数（dict） | 命名参数数组 |
| `a: str` | 类型注解（运行时不强制） | PHP 类型声明（会强制） |
| `-> Product` | 返回类型 | 返回类型声明 |

Python 参数是**按赋值传递**：传对象引用，重新绑定不影响调用方，原地修改会影响调用方。

```python
def rebind(items: list[int]) -> None:
    items = [99]        # 调用方看不到

def mutate(items: list[int]) -> None:
    items.append(99)    # 调用方看得到
```

### 可变默认参数（必踩）

```python
def add_bad(item: str, bucket: list[str] = []) -> list[str]:
    bucket.append(item)
    return bucket

add_bad("a")   # ['a']
add_bad("b")   # ['a', 'b']  ← 共享了同一个 list
```

默认值在**函数定义时**求值一次。正确写法：

```python
def add_safe(item: str, bucket: list[str] | None = None) -> list[str]:
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket
```

dataclass 同理，用 `field(default_factory=list)`。完整演示见 [mutable_defaults.py](../code/lang-basics/src/basics/mutable_defaults.py)。

## 7. 引用语义与拷贝

PHP 数组写时复制，`$b = $a; $b[] = 1;` 不影响 `$a`。Python 不是：

```python
a = [1, 2]
b = a
b.append(3)
a            # [1, 2, 3]

c = a.copy()          # 浅拷贝：顶层独立，嵌套对象仍共享
d = copy.deepcopy(a)  # 深拷贝：完全隔离
```

| 操作 | 效果 |
|---|---|
| `b = a` | 别名 |
| `a.copy()` / `list(a)` / `a[:]` | 浅拷贝 |
| `copy.deepcopy(a)` | 深拷贝 |
| `dict(a)` / `{**a}` | dict 浅拷贝 |

不能因为“性能”滥用 deepcopy；先设计不可变数据，再在边界处拷贝。

## 8. 闭包与作用域

```python
def make_counter() -> Callable[[], int]:
    count = 0

    def increment() -> int:
        nonlocal count
        count += 1
        return count

    return increment
```

- 读外层变量不需要声明；**重新赋值**需要 `nonlocal`。
- 循环里创建闭包有“晚绑定”坑：

```python
funcs = [lambda: i for i in range(3)]
[f() for f in funcs]        # [2, 2, 2]
funcs = [lambda i=i: i for i in range(3)]   # 绑定默认值
```

- 全局变量修改需要 `global`（生产代码尽量不用）。

## 9. 推导式与生成器表达式

```python
names = [p.name for p in products if p.stock > 0]
by_sku = {p.sku: p for p in products}
unique = {p.category for p in products}
total = sum(p.price * p.qty for p in lines)
```

- 列表推导式立即求值；生成器表达式惰性求值。
- 嵌套超过两层就改成普通循环，可读性优先。
- 带副作用（写库、发消息）不要塞进推导式。

## 10. 装饰器预告

```python
@timed
def slow() -> None: ...

@retry(attempts=3, exceptions=(ConnectionError,))
def call_api() -> dict[str, object]: ...
```

装饰器是“接收函数、返回可调用对象”的语法糖，约等于 Laravel 中间件或 AOP。实现细节见 [decorators.py](../code/lang-basics/src/basics/decorators.py)；资源管理相关的 `with` 见 [04 章](04-异常-迭代器-上下文管理器.md)。

## 11. 现代语法清单（3.10–3.14）

| 语法 | 版本 | 示例 |
|---|---|---|
| 结构化模式匹配 | 3.10 | `match status: case "PAID": ...` |
| `X | Y` 联合类型 | 3.10 | `int | None` |
| 泛型新语法 | 3.12 | `class Repo[T]: ...` |
| `type` 别名 | 3.12 | `type ProductId = int` |
| `StrEnum` | 3.11 | 可直接 JSON 序列化的枚举 |
| `ExceptionGroup` / `except*` | 3.11 | 批量错误 |
| `asyncio.TaskGroup` | 3.11 | 结构化并发 |
| free-threaded 构建 | 3.13+ | `python3.14t`，可选关闭 GIL |
| 模板字符串 `t""` | 3.14 | 安全拼接/结构化日志（生态尚新） |

## 12. 本章验收

```bash
cd code/lang-basics
uv run pytest tests/test_truthiness_and_equality.py \
              tests/test_collections_vs_array.py \
              tests/test_mutable_defaults.py \
              tests/test_money.py
```

能解释下面三行输出，就掌握了本章最容易出错的部分：

```python
add_bad("a"); add_bad("b")     # ['a', 'b']
[] == False                     # False
0.1 + 0.2 == 0.3                # False
```
