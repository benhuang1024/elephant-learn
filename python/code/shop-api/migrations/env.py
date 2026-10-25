"""Alembic 环境：URL 从 pydantic-settings 读取，模型元数据来自 Base.metadata。"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from shop.config import get_settings
from shop.db import Base
from shop.order import models as order_models  # noqa: F401 - 注册到 Base.metadata
from shop.product import models as product_models  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 环境变量 DB_URL 覆盖 alembic.ini；% 需要转义，避免 configparser 插值
config.set_main_option("sqlalchemy.url", get_settings().db_url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
