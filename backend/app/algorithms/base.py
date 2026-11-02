"""Algorithm interface; HTTP and database code must not live in an implementation."""
from typing import Protocol, runtime_checkable

from app.models import (
    AlgorithmInfo, ArchMechanism, DesignRequest, GenerateRequest, GeoParams,
    InferRequest, MethodMatch, RecheckRequest, SafetyAssessment, SchemeReport,
    SupportComponent, SupportValues, Catalog, SupportTemplate,
)


class AlgorithmInputError(ValueError):
    """An otherwise valid input is outside the algorithm's supported domain."""


@runtime_checkable
class DecisionAlgorithm(Protocol):
    @property
    def info(self) -> AlgorithmInfo: ...

    def infer(self, request: InferRequest) -> list[MethodMatch]: ...

    def design(self, request: DesignRequest, values: SupportValues | None = None) -> list[SupportComponent]: ...

    def assess(self, request: RecheckRequest) -> SafetyAssessment: ...

    def mechanism(self, params: GeoParams) -> ArchMechanism | None: ...

    def report(self, request: GenerateRequest) -> SchemeReport: ...


@runtime_checkable
class TemplateAlgorithm(DecisionAlgorithm, Protocol):
    catalog: Catalog

    def templates_for(self, request: DesignRequest) -> list[SupportTemplate]: ...

    def chosen_template(self, request: DesignRequest) -> SupportTemplate: ...
