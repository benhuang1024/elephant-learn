"""商品仓储：把查询细节从 Service 里隔离开（≈ Laravel Repository 模式）。"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shop.product.models import Product


class ProductRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def search(self, keyword: str | None) -> list[Product]:
        statement = select(Product).order_by(Product.name)
        if keyword and (query := keyword.strip()):
            statement = statement.where(func.lower(Product.name).contains(query.lower()))
        return list(self.session.scalars(statement))

    def get(self, product_id: int) -> Product | None:
        return self.session.get(Product, product_id)

    def get_by_sku(self, sku: str) -> Product | None:
        return self.session.scalar(select(Product).where(Product.sku == sku))

    def add(self, product: Product) -> None:
        self.session.add(product)

    def delete(self, product: Product) -> None:
        self.session.delete(product)
