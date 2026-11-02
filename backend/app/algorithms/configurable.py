"""D1: database rules and complete templates. No invented mechanical predictions."""
from hashlib import sha256
from datetime import datetime
import json
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.algorithms.base import AlgorithmInputError
from app.algorithms.rule_matching import match_rule, matches
from app.models import (
    AlgorithmInfo, ArchMechanism, Catalog, DesignRequest, GenerateRequest, GeoParams,
    InferRequest, MethodMatch, RecheckRequest, SafetyAssessment, SchemeReport, SchemeRow,
    SupportComponent, SupportTemplate, SupportValues, geo_values,
)
from app.repositories.catalog import CatalogRepository


class ConfigurableAlgorithm:
    def __init__(self, repository: CatalogRepository):
        self.catalog: Catalog = repository.read()
        content = self.catalog.model_dump(mode='json',by_alias=True)
        self._version = '1.0.0+' + sha256(json.dumps(content,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()[:20]

    @property
    def info(self) -> AlgorithmInfo:
        return AlgorithmInfo(id='database-rules',version=self._version,reference=True,
            capabilities=['partial-input','template-selection','observation-sync'],
            description='数据库条件规则与完整支护模板；尚未接入力学响应预测和安全判据。测试资料均带来源与批次。')

    def infer(self, request: InferRequest) -> list[MethodMatch]:
        params = geo_values(request.params)
        result = []
        for method in self.catalog.methods:
            rules = [rule for rule in self.catalog.rules if rule.enabled and rule.kind == 'method' and rule.method_key == method.key]
            hits = [(rule,match_rule(rule,params)) for rule in rules]
            excluded = [rule for rule,state in hits if state == 'excluded']
            matched = [rule for rule,state in hits if state == 'matched']
            if excluded:
                status, relevant = 'inapplicable', excluded
            elif matched:
                status, relevant = 'candidate', matched
            else:
                status = 'insufficient' if any(state == 'insufficient' for _,state in hits) else 'uncovered'
                relevant = [rule for rule,state in hits if state == 'insufficient']
            reasons = []
            for rule in relevant:
                extra = ''
                if status == 'insufficient':
                    fields = sorted({item.field for item in rule.conditions.all+rule.conditions.exclude_any if item.field not in params})
                    extra = f'缺少条件字段 {", ".join(fields)}；'
                elif status == 'inapplicable':
                    fields = [f'{item.field}={params.get(item.field)}' for item in rule.conditions.exclude_any if matches(item,params) is True]
                    extra = f'命中排除条件 {", ".join(fields)}；'
                reasons.append(f'{rule.name} v{rule.version}：{extra}{rule.reason}')
            priority = max((rule.priority for rule in matched),default=None) if not excluded else None
            result.append(MethodMatch(**method.model_dump(),matched=False,status=status,priority=priority,
                reasons=reasons or ['没有命中有效规则；需要人工确认并说明理由'],
                rules=[{'code':rule.code,'version':rule.version,'priority':rule.priority} for rule in relevant]))
        best = max((item.priority for item in result if item.priority is not None),default=None)
        for item in result:
            if best is not None and item.priority == best:
                item.matched = True
                item.status = 'recommended'
        return result

    def templates_for(self, request: DesignRequest) -> list[SupportTemplate]:
        method = next(item for item in self.infer(request) if item.key == request.method_key)
        if method.status == 'inapplicable':
            raise AlgorithmInputError('所选工法命中硬性排除条件，不能用于支护设计')
        if method.status in ('uncovered','insufficient') and not request.manual_reason.strip():
            raise AlgorithmInputError('工法规则未覆盖，人工选择必须填写理由')
        rules = [rule for rule in self.catalog.rules if rule.enabled and rule.kind == 'support' and rule.method_key == request.method_key]
        hits = [(rule,match_rule(rule,geo_values(request.params))) for rule in rules]
        blocked = {(rule.template_code,rule.template_version) for rule,state in hits if state == 'excluded'}
        available = {(template.code,template.version):template for template in self.catalog.templates if template.enabled}
        matches = [rule for rule,state in hits if state == 'matched' and (rule.template_code,rule.template_version) in available and (rule.template_code,rule.template_version) not in blocked]
        priority = max((rule.priority for rule in matches),default=None)
        keys = sorted({(rule.template_code,rule.template_version) for rule in matches if rule.priority == priority})
        return [available[key].model_copy(deep=True) for key in keys]

    def chosen_template(self, request: DesignRequest) -> SupportTemplate:
        options = self.templates_for(request)
        if not options:
            raise AlgorithmInputError('没有匹配的已启用完整支护模板，请维护规则和模板；不会套用其他围岩模板')
        if request.template:
            selected = next((item for item in options if item.code == request.template.code and item.version == request.template.version),None)
            if selected is None:
                raise AlgorithmInputError('所选模板不在当前适用候选中，请重新选择')
            return selected
        if len(options) != 1:
            raise AlgorithmInputError('存在多套同优先级支护模板，请先人工选择')
        return options[0]

    def design(self, request: DesignRequest, values: SupportValues | None = None) -> list[SupportComponent]:
        template = self.chosen_template(request)
        p = template.parameters.model_copy(deep=True)
        if values:
            p.steel.spacing_cm, p.shot.thickness_cm = values.steel,values.shot
            p.anchor.length_m, p.advance.ring_spacing_cm = values.anchor,values.advance
        base = f'{template.name} · {template.code} v{template.version}；{template.source}'
        if template.test_batch_id:
            base += f'；临时测试资料 {template.test_batch_id}'
        details = [
            ('steel','型钢钢架',p.steel.model,f'间距 {p.steel.spacing_cm:g} cm',p.steel.spacing_cm,'cm',p.steel,'#5aa2f8'),
            ('shot','喷射混凝土',p.shot.strength,f'厚度 {p.shot.thickness_cm:g} cm',p.shot.thickness_cm,'cm',p.shot,'#3ddc97'),
            ('anchor','系统锚杆',f'{p.anchor.type} Φ{p.anchor.diameter_mm:g} mm',f'长度 {p.anchor.length_m:g} m；纵向 {p.anchor.longitudinal_spacing_cm:g} cm × 环向 {p.anchor.circumferential_spacing_cm:g} cm',p.anchor.length_m,'m',p.anchor,'#2dd4bf'),
            ('advance','超前支护',f'{p.advance.type} Φ{p.advance.diameter_mm:g} mm',f'长度 {p.advance.length_m:g} m；环距 {p.advance.ring_spacing_cm:g} cm；{p.advance.scope}',p.advance.ring_spacing_cm,'cm',p.advance,'#a78bfa'),
        ]
        return [SupportComponent(key=key,label=label,spec=spec,layout=layout,val_num=value,unit=unit,basis=base,
            conf=None,parameters=data.model_dump(by_alias=True),color=color) for key,label,spec,layout,value,unit,data,color in details]

    def assess(self, request: RecheckRequest) -> SafetyAssessment:
        self.design(request,SupportValues.model_validate({item.key:item.val_num for item in request.support}))
        return SafetyAssessment(status='unavailable',scope='尚未启用安全评价',tag='无法评价',score=None,radar=None,
            reason='D1 已完成规则与模板配置；力学响应模型和控制判据尚未接入，不能据此认定变形或支护承载满足。',algorithm=self.info)

    def mechanism(self, _params: GeoParams) -> ArchMechanism | None:
        return None

    def report(self, request: GenerateRequest) -> SchemeReport:
        support = self.design(request,SupportValues.model_validate({item.key:item.val_num for item in request.support}))
        method = next(item for item in self.catalog.methods if item.key == request.method_key)
        rows = [SchemeRow(process='开挖工法',spec=method.name,quantity='施工进尺待确定',basis='按本轮规则与人工确认结果')]
        rows += [SchemeRow(process=item.label,spec=item.spec,quantity=item.layout,basis=item.basis) for item in support]
        rows += [SchemeRow(process='评价状态',spec='待复核：无法评价',quantity='未接入响应模型与判据',basis='不包含结构安全结论')]
        return SchemeReport(no=f'预览-{uuid4()}',time=datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M'),
            mile=request.mileage,grade=str(geo_values(request.params).get('grade','未提供')),method=method.name,rows=rows,algorithm=self.info)


def create_algorithm(repository: CatalogRepository) -> ConfigurableAlgorithm:
    return ConfigurableAlgorithm(repository)
