"""An executable example of swapping an algorithm through configuration."""
from app.algorithms.reference import ReferenceAlgorithm
from app.models import AlgorithmInfo, InferRequest, MethodMatch
from app.repositories.catalog import CatalogRepository


class CustomAlgorithm(ReferenceAlgorithm):
    @property
    def info(self) -> AlgorithmInfo:
        return AlgorithmInfo(id='custom-example', version='test-1', reference=True, description='用于验证算法替换的测试实现')

    def infer(self, request: InferRequest) -> list[MethodMatch]:
        return [item.model_copy(update={'matched': item.key == 'core', 'score': 99 if item.key == 'core' else 40})
                for item in super().infer(request)]


def create_algorithm(repository: CatalogRepository) -> CustomAlgorithm:
    return CustomAlgorithm(repository)
