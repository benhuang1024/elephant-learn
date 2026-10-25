"""数据库引擎、Session 工厂与请求级 Session 依赖。

SQLAlchemy 的 Session ≈ Doctrine 的 EntityManager / JPA 的持久化上下文，
**不是** Eloquent 的 ActiveRecord。一个请求一个 Session，请求结束关闭并回滚未提交事务。
"""

from collections.abc import Iterator
from typing import Any

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    """所有 ORM 模型的基类；Alembic 的 target_metadata 就是 ``Base.metadata``。"""


def version_generator(current: int | None) -> int:
    """版本号从 0 开始（与 Java ``@Version`` 对齐），之后每次 UPDATE +1。"""
    return 0 if current is None else current + 1


class Database:
    def __init__(self, url: str, *, echo: bool = False) -> None:
        engine_kwargs: dict[str, Any] = {"echo": echo}
        if url.startswith("sqlite"):
            engine_kwargs["connect_args"] = {"check_same_thread": False}
            if ":memory:" in url:
                # 内存库必须复用同一个连接，否则每个连接看到一个空数据库
                engine_kwargs["poolclass"] = StaticPool
        self.engine = create_engine(url, **engine_kwargs)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            expire_on_commit=False,
        )

    def session(self) -> Iterator[Session]:
        with self.session_factory() as session:
            yield session

    def dispose(self) -> None:
        self.engine.dispose()


def get_db(request: Request) -> Iterator[Session]:
    """FastAPI 依赖：每个请求一个 Session，响应完成后自动 close（未提交则回滚）。"""
    database: Database = request.app.state.db
    yield from database.session()
