from datetime import datetime, timezone
from decimal import Decimal

from app.algorithms.base import DecisionAlgorithm, AlgorithmInputError, TemplateAlgorithm
from app.models import (
    DecisionMeta, DecisionPayload, DesignRequest, DesignResponse, GenerateRequest,
    InferRequest, InferResponse, InputSnapshot, RecheckRequest, ReportSnapshot,
    RevisionSnapshot, SafetyAssessment, SaveDecisionRequest, SchemeReport,
    AlgorithmInfo, SynchronizeRequest, SynchronizeResponse, SupportOptionsResponse, GeoParams, geo_values,
)
from app.repositories.catalog import CatalogRepository


def chainage_meters(value: str) -> Decimal:
    km, remainder = value[1:].split('+')
    if Decimal(remainder) >= 1000:
        raise ValueError('invalid chainage')
    return Decimal(km)*1000+Decimal(remainder)


class AlgorithmVersionConflict(ValueError):
    pass


class DecisionService:
    def __init__(self, algorithm: DecisionAlgorithm, repository: CatalogRepository):
        self.algorithm = algorithm
        self.repository = repository

    def meta(self) -> DecisionMeta:
        return self.repository.read().meta.model_copy(update={'algorithm': self.algorithm.info})

    def ensure_version(self, expected: AlgorithmInfo | None) -> None:
        actual = self.algorithm.info
        if expected is not None and (expected.id,expected.version,expected.reference) != (actual.id,actual.version,actual.reference):
            raise AlgorithmVersionConflict('规则、模板或输入资料版本已变化，请重新匹配后继续')

    def synchronize(self, request: SynchronizeRequest) -> SynchronizeResponse:
        try:
            cutoff = datetime.fromisoformat(request.at.replace('Z','+00:00')) if request.at else datetime.now(timezone.utc)
            if cutoff.tzinfo is None:
                raise ValueError('timezone required')
            target = chainage_meters(request.mileage)
            records = [item for item in self.repository.read().observations if item.workface == request.workface
                and chainage_meters(item.mileage) == target and datetime.fromisoformat(item.observed_at.replace('Z','+00:00')) <= cutoff]
        except (ValueError,ArithmeticError) as error:
            raise AlgorithmInputError('无效的桩号或查询时间，时间必须包含时区') from error
        if not records:
            return SynchronizeResponse(status='not_found',message='该工作面和位置没有有效采集记录；没有用默认值替代实测数据',algorithm=self.algorithm.info)
        newest = max(datetime.fromisoformat(item.observed_at.replace('Z','+00:00')) for item in records)
        candidates = [item for item in records if datetime.fromisoformat(item.observed_at.replace('Z','+00:00')) == newest]
        if len(candidates) > 1:
            return SynchronizeResponse(status='conflict',candidates=candidates,message='同一位置存在同时间的多条记录，请先核对资料',algorithm=self.algorithm.info)
        observation = candidates[0]
        missing = [field.alias or name for name,field in GeoParams.model_fields.items() if (field.alias or name) not in observation.params]
        return SynchronizeResponse(status='incomplete' if missing else 'found',observation=observation,missing=missing,
            message='资料缺少必需参数，请补充后再计算' if missing else '已加载对应位置的采集快照',algorithm=self.algorithm.info)

    def support_options(self, request: DesignRequest) -> SupportOptionsResponse:
        self.ensure_version(request.algorithm)
        options = self.algorithm.templates_for(request) if isinstance(self.algorithm,TemplateAlgorithm) else []
        return SupportOptionsResponse(options=options,algorithm=self.algorithm.info)

    def infer(self, request: InferRequest) -> InferResponse:
        self.ensure_version(request.algorithm)
        if 'partial-input' not in self.algorithm.info.capabilities and not isinstance(request.params,GeoParams):
            raise AlgorithmInputError('旧参考算法要求完整参数，请补充所有字段')
        methods = self.algorithm.infer(request)
        if len({item.key for item in methods}) != len(methods):
            raise ValueError('algorithm returned duplicate method keys')
        return InferResponse(methods=methods, algorithm=self.algorithm.info)

    def design(self, request: DesignRequest) -> DesignResponse:
        self.ensure_version(request.algorithm)
        if 'partial-input' not in self.algorithm.info.capabilities and not isinstance(request.params,GeoParams):
            raise AlgorithmInputError('旧参考算法要求完整参数，请补充所有字段')
        support = self.algorithm.design(request)
        check = RecheckRequest(**request.model_dump(), support=support)
        template = self.algorithm.chosen_template(request) if isinstance(self.algorithm,TemplateAlgorithm) else None
        return DesignResponse(support=support, safety=self.assess(check),
                              template={"code":template.code,"version":template.version} if template else None,
                              mechanism=self.algorithm.mechanism(request.params), algorithm=self.algorithm.info)

    def assess(self, request: RecheckRequest) -> SafetyAssessment:
        self.ensure_version(request.algorithm)
        if 'partial-input' not in self.algorithm.info.capabilities and not isinstance(request.params,GeoParams):
            raise AlgorithmInputError('旧参考算法要求完整参数')
        return self.algorithm.assess(request).model_copy(update={'algorithm': self.algorithm.info})

    def report(self, request: GenerateRequest) -> SchemeReport:
        self.ensure_version(request.algorithm)
        if 'partial-input' not in self.algorithm.info.capabilities and not isinstance(request.params,GeoParams):
            raise AlgorithmInputError('旧参考算法要求完整参数')
        return self.algorithm.report(request).model_copy(update={'algorithm': self.algorithm.info})

    def snapshot(self, request: SaveDecisionRequest) -> DecisionPayload:
        if 'partial-input' not in self.algorithm.info.capabilities and not isinstance(request.params,GeoParams):
            raise AlgorithmInputError('旧参考算法要求完整参数')
        info = self.algorithm.info
        if request.algorithm is not None and (request.algorithm.id, request.algorithm.version, request.algorithm.reference) != (info.id, info.version, info.reference):
            raise AlgorithmVersionConflict('算法版本已变化，请重新推理并生成方案后保存')
        origin: dict[str,object] = {'source':'manual','modified':False}
        if request.observation_id:
            record = next((item for item in self.repository.read().observations if item.id == request.observation_id
                and item.workface == request.workface and chainage_meters(item.mileage) == chainage_meters(request.mileage)),None)
            if record is None:
                raise AlgorithmInputError('采集记录不属于当前工作面或里程，请重新同步')
            origin = {'observationId':record.id,'source':record.source,'observedAt':record.observed_at,
                'originalParams':record.params,'modified':geo_values(request.params) != record.params,'testBatchId':record.test_batch_id}
        revisions = []
        for item in request.revisions:
            design = DesignRequest(params=request.params, method_key=item.method_key, workface=request.workface, mileage=request.mileage,template=item.template,manual_reason=item.manual_reason)
            support = self.algorithm.design(design, item.values)
            check = RecheckRequest(**design.model_dump(), support=support)
            template = self.algorithm.chosen_template(design) if isinstance(self.algorithm,TemplateAlgorithm) else None
            rules = [rule.model_dump(mode='json',by_alias=True) for rule in self.algorithm.catalog.rules] if isinstance(self.algorithm,TemplateAlgorithm) else []
            revisions.append(RevisionSnapshot(method_key=item.method_key, support=support,
                template=template.model_dump(mode='json',by_alias=True) if template else None,rules=rules,
                safety=self.assess(check), reason=f'{item.reason}；人工选择理由：{item.manual_reason}' if item.manual_reason else item.reason))
        last = revisions[-1]
        report = self.report(GenerateRequest(params=request.params, method_key=last.method_key,
                                             mileage=request.mileage, workface=request.workface, support=last.support,template=request.revisions[-1].template,manual_reason=request.revisions[-1].manual_reason))
        return DecisionPayload(request_key=request.request_key, mode=request.mode, workface=request.workface,
            channel='mock' if info.reference else 'real', source='simulation' if info.reference else 'algorithm',
            algorithm_version=f'{info.id}:{info.version}',
            input=InputSnapshot(params=request.params, mileage=request.mileage, workface=request.workface,origin=origin),
            candidates=self.infer(InferRequest(params=request.params, workface=request.workface, mileage=request.mileage)).methods,
            revisions=revisions, report=ReportSnapshot(mile=report.mile, grade=report.grade, method=report.method,
                                                       rows=report.rows, algorithm=info))
