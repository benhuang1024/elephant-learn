# /// script
# requires-python = ">=3.14"
# dependencies = ["rich>=14.0"]
# ///
"""单文件脚本：靠 PEP 723 内联依赖，``uv run scripts/hello.py`` 即可，无需虚拟环境。"""

import platform
import sys
from decimal import Decimal

from rich.console import Console
from rich.table import Table


def main() -> None:
    console = Console()
    table = Table(title="Hello, PHPer!")
    table.add_column("项目")
    table.add_column("值")
    table.add_row("Python", platform.python_version())
    table.add_row("解释器", sys.executable)
    table.add_row("Decimal", str(Decimal("0.1") + Decimal("0.2")))
    table.add_row("GIL", "启用" if sys._is_gil_enabled() else "已关闭（free-threaded）")
    console.print(table)


if __name__ == "__main__":
    main()
