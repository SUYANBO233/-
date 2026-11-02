"""A port of the project's existing UI rules, not a calibrated engineering model.

Inference uses only rock grade. Design/mechanism templates cover IV and V.
Assessment is a relative template score, not a force/stress/stability calculation.
"""
from datetime import datetime
import math
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.algorithms.base import AlgorithmInputError
from app.models import (
    AlgorithmInfo, ArchMechanism, DesignRequest, GenerateRequest, GeoParams,
    InferRequest, MethodMatch, RecheckRequest, SafetyAssessment, SafetyRadar,
    SchemeReport, SchemeRow, SupportComponent, SupportValues,
)
from app.repositories.catalog import CatalogRepository


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


class ReferenceAlgorithm:
    def __init__(self, repository: CatalogRepository):
        self._repository = repository

    @property
    def info(self) -> AlgorithmInfo:
        return AlgorithmInfo(id='reference-rules', version='1.0.0', reference=True,
            description='项目原有规则的 Python 演示实现；评分、成拱参数和参考权重未经工程标定')

    def infer(self, request: InferRequest) -> list[MethodMatch]:
        grade = request.params.grade
        recommended = 'core' if grade in ('V','VI') else 'full' if grade in ('I','II','III') else 'bench'
        return [MethodMatch(**method.model_dump(), score=98 if method.key == recommended else 45 if method.key == 'full' else 60,
                           matched=method.key == recommended)
                for method in self._repository.read().methods]

    def design(self, request: DesignRequest, values: SupportValues | None = None) -> list[SupportComponent]:
        catalog = self._repository.read()
        if request.params.grade not in catalog.support_by_grade:
            raise AlgorithmInputError('当前参考支护模板仅覆盖 IV、V 级围岩，请替换算法后处理其他围岩等级')
        components = catalog.support_by_grade[request.params.grade]
        for component in components:
            component.label = component.label.split(' (')[0]
            component.basis = f'参考模板：{component.basis}（未作工程校核）'
            if values is not None:
                component.val_num = getattr(values, component.key)
                value = f'{component.val_num:g}'
                component.layout = {
                    'steel': f'间距 {value} cm', 'shot': f'厚度 {value} cm',
                    'anchor': f'L={value}m（已修改）', 'advance': f'环距 {value} cm',
                }[component.key]
        return components

    def assess(self, request: RecheckRequest) -> SafetyAssessment:
        baseline = {item.key: item.val_num for item in self.design(DesignRequest(params=request.params, method_key=request.method_key))}
        factors = [clamp(baseline[item.key] / item.val_num if item.key in ('steel','advance')
                         else item.val_num / baseline[item.key], 0.7, 1.3) for item in request.support]
        factor = sum(factors) / len(factors)
        is_v = request.params.grade == 'V'
        score = clamp(math.floor((85.8 if is_v else 91.3) * factor * 10 + 0.5) / 10, 40, 99)
        label = '较高' if score > 75 else '一般' if score >= 60 else '较低'
        radar = [85,88,90,84,82,86] if is_v else [92,90,93,88,91,94]
        return SafetyAssessment(score=score, tag=f'参考评分{label} ({score:g})',
            reason='按四类构件相对模板的比例计算演示评分，未计算实际荷载、承载力或规范安全系数；不能据此认定结构安全。',
            radar=SafetyRadar(labels=['钢架承载','喷层抗剪','锚杆抗拔','抗大变形','成拱闭合','支护时效'],
                data=[clamp(math.floor(value * factor + 0.5),0,100) for value in radar]), algorithm=self.info)

    def mechanism(self, params: GeoParams) -> ArchMechanism:
        if params.grade not in self._repository.read().support_by_grade:
            raise AlgorithmInputError('当前参考成拱参数仅覆盖 IV、V 级围岩')
        return ArchMechanism(height='12.4 m' if params.grade == 'V' else '8.2 m',
                             release='48 %' if params.grade == 'V' else '65 %',
                             close_time='0.9 D' if params.grade == 'V' else '0.7 D')

    def report(self, request: GenerateRequest) -> SchemeReport:
        # Revalidate the supported domain even if report is called directly.
        canonical = self.design(DesignRequest(params=request.params, method_key=request.method_key),
            SupportValues.model_validate({item.key: item.val_num for item in request.support}))
        method = next(item for item in self._repository.read().methods if item.key == request.method_key)
        components = {item.key: item for item in canonical}
        rows = [SchemeRow(process='开挖工法', spec=method.name, quantity=f'参考单循环进尺 {method.adv}',
                          basis=f'参考循环耗时 {method.cycle} · 参考月进尺 {method.month}')]
        for key, title in [('advance','超前支护'),('steel','型钢钢架'),('shot','喷射混凝土'),('anchor','系统锚杆')]:
            component = components[key]
            rows.append(SchemeRow(process=title, spec=component.spec, quantity=component.layout, basis=component.basis))
        rows.append(SchemeRow(process='核心施工装备', spec=method.equip, quantity='数量待施工组织设计确定', basis='按项目工法库展示参考配套'))
        return SchemeReport(no=f'预览-{uuid4()}', time=datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M'),
            mile=request.mileage, grade=f'{request.params.grade} 级', method=method.name, rows=rows, algorithm=self.info)


def create_algorithm(repository: CatalogRepository) -> ReferenceAlgorithm:
    return ReferenceAlgorithm(repository)
