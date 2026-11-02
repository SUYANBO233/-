from app.algorithms.base import DecisionAlgorithm
from app.models import (
    DecisionMeta, DecisionPayload, DesignRequest, DesignResponse, GenerateRequest,
    InferRequest, InferResponse, InputSnapshot, RecheckRequest, ReportSnapshot,
    RevisionSnapshot, SafetyAssessment, SaveDecisionRequest, SchemeReport,
)
from app.repositories.catalog import CatalogRepository


class AlgorithmVersionConflict(ValueError):
    pass


class DecisionService:
    def __init__(self, algorithm: DecisionAlgorithm, repository: CatalogRepository):
        self.algorithm = algorithm
        self.repository = repository

    def meta(self) -> DecisionMeta:
        return self.repository.read().meta.model_copy(update={'algorithm': self.algorithm.info})

    def infer(self, request: InferRequest) -> InferResponse:
        methods = self.algorithm.infer(request)
        if len([item for item in methods if item.matched]) != 1:
            raise ValueError('algorithm must recommend exactly one candidate')
        if len({item.key for item in methods}) != len(methods):
            raise ValueError('algorithm returned duplicate method keys')
        return InferResponse(methods=methods, algorithm=self.algorithm.info)

    def design(self, request: DesignRequest) -> DesignResponse:
        support = self.algorithm.design(request)
        check = RecheckRequest(**request.model_dump(), support=support)
        return DesignResponse(support=support, safety=self.assess(check),
                              mechanism=self.algorithm.mechanism(request.params), algorithm=self.algorithm.info)

    def assess(self, request: RecheckRequest) -> SafetyAssessment:
        return self.algorithm.assess(request).model_copy(update={'algorithm': self.algorithm.info})

    def report(self, request: GenerateRequest) -> SchemeReport:
        return self.algorithm.report(request).model_copy(update={'algorithm': self.algorithm.info})

    def snapshot(self, request: SaveDecisionRequest) -> DecisionPayload:
        info = self.algorithm.info
        if request.algorithm is not None and (request.algorithm.id, request.algorithm.version, request.algorithm.reference) != (info.id, info.version, info.reference):
            raise AlgorithmVersionConflict('算法版本已变化，请重新推理并生成方案后保存')
        revisions = []
        for item in request.revisions:
            design = DesignRequest(params=request.params, method_key=item.method_key, workface=request.workface, mileage=request.mileage)
            support = self.algorithm.design(design, item.values)
            check = RecheckRequest(**design.model_dump(), support=support)
            revisions.append(RevisionSnapshot(method_key=item.method_key, support=support,
                safety=self.assess(check), reason=item.reason))
        last = revisions[-1]
        report = self.report(GenerateRequest(params=request.params, method_key=last.method_key,
                                             mileage=request.mileage, workface=request.workface, support=last.support))
        return DecisionPayload(request_key=request.request_key, mode=request.mode, workface=request.workface,
            channel='mock' if info.reference else 'real', source='simulation' if info.reference else 'algorithm',
            algorithm_version=f'{info.id}:{info.version}',
            input=InputSnapshot(params=request.params, mileage=request.mileage, workface=request.workface),
            candidates=self.infer(InferRequest(params=request.params, workface=request.workface, mileage=request.mileage)).methods,
            revisions=revisions, report=ReportSnapshot(mile=report.mile, grade=report.grade, method=report.method,
                                                       rows=report.rows, algorithm=info))
