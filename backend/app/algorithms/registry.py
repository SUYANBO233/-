from importlib import import_module

from app.algorithms.base import DecisionAlgorithm
from app.repositories.catalog import CatalogRepository


def load_algorithm(factory_path: str, repository: CatalogRepository) -> DecisionAlgorithm:
    module_name, separator, name = factory_path.partition(':')
    if not separator or not module_name or not name:
        raise ValueError('DECISION_ALGORITHM_FACTORY must use module.path:create_algorithm')
    factory = getattr(import_module(module_name), name)
    if not callable(factory):
        raise TypeError('algorithm factory must be callable')
    algorithm: object = factory(repository)
    if not isinstance(algorithm, DecisionAlgorithm):
        raise TypeError('algorithm must implement app.algorithms.base.DecisionAlgorithm')
    return algorithm
