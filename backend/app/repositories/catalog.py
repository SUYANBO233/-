"""Replace this repository to read workfaces/templates from a database or other service."""
from pathlib import Path
from typing import Protocol

from app.models import Catalog


class CatalogRepository(Protocol):
    def read(self) -> Catalog: ...


class JsonCatalogRepository:
    def __init__(self, path: Path):
        self._catalog = Catalog.model_validate_json(path.read_text(encoding='utf-8'))

    def read(self) -> Catalog:
        return self._catalog.model_copy(deep=True)
