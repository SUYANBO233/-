"""Replace this repository to read workfaces/templates from a database or other service."""
from pathlib import Path
from typing import Protocol
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from app.models import Catalog


class CatalogRepository(Protocol):
    def read(self) -> Catalog: ...


class JsonCatalogRepository:
    def __init__(self, path: Path):
        self._catalog = Catalog.model_validate_json(path.read_text(encoding='utf-8'))

    def read(self) -> Catalog:
        return self._catalog.model_copy(deep=True)


class CatalogUnavailable(RuntimeError):
    pass


class FrozenCatalogRepository:
    def __init__(self, catalog: Catalog):
        self._catalog = catalog.model_copy(deep=True)

    def read(self) -> Catalog:
        return self._catalog.model_copy(deep=True)


class HttpCatalogRepository:
    """Next.js owns persistence; the algorithm only reads an authenticated snapshot."""
    def __init__(self, url: str, api_key: str):
        self.url = url
        self.api_key = api_key

    def read(self) -> Catalog:
        if not self.api_key:
            raise CatalogUnavailable('内部资料接口密钥未配置；请用 pnpm dev:all 或 pnpm dev:d1 联合启动')
        try:
            request = Request(self.url, headers={'X-Catalog-Key':self.api_key})
            with urlopen(request,timeout=10) as response:
                payload = response.read(10 * 1024 * 1024 + 1)
            if len(payload) > 10 * 1024 * 1024:
                raise CatalogUnavailable('当前资料快照超过大小限制，请缩小数据范围')
            return Catalog.model_validate_json(payload)
        except HTTPError as error:
            if error.code == 503:
                raise CatalogUnavailable('决策数据库未配置或资料不可用；本地验证请显式使用 pnpm dev:d1') from error
            raise CatalogUnavailable('读取内部决策资料失败，请检查资料接口认证与数据库迁移') from error
        except (URLError,TimeoutError,ValueError) as error:
            raise CatalogUnavailable('无法读取有效的决策资料，请确认前端服务已启动且资料完整') from error
