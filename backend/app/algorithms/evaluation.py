"""Compare compatible metrics only. Never manufacture a safety score."""
from decimal import Decimal
from app.models import SafetyAssessment
from app.response_models import EvaluationItem, ResponseResult, EvaluationCriterion

NAMES={'settlement':'拱顶沉降','convergence':'水平周边收敛'}

def evaluate(response:ResponseResult,criteria:list[EvaluationCriterion],section_type:str | None,allow_test:bool=False) -> SafetyAssessment:
    items=[];context=response.context
    enabled=[c for c in criteria if c.enabled]
    for key,name in NAMES.items():
        metric=next((m for m in response.metrics if m.key==key),None)
        candidates=[c for c in enabled if c.metric==key and context and c.stage==context.stage
            and c.displacement_reference==context.displacement_reference and section_type in c.section_types]
        criterion=candidates[0] if len(candidates)==1 else None
        required=any(c.required for c in candidates) if candidates else True
        reason='';status='unavailable';value=metric.value if metric else None
        if len(candidates)>1: reason='存在多个适用判据，请停用冲突版本或条件'
        elif not criterion: reason='没有同断面类型、阶段和位移基准的有效判据'
        elif (criterion.source=='simulation' or response.provider.is_test) and not allow_test: reason='正式模式不使用测试响应或测试判据'
        elif response.status=='unavailable': reason=response.reason
        elif not metric or value is None: reason=metric.reason if metric else '缺少响应指标'
        elif metric.unit!=criterion.unit: reason='响应与判据单位不一致，未进行比较'
        else:
            v=Decimal(str(value))
            passed=(v<=Decimal(str(criterion.upper))) if criterion.operator=='<=' else (v>=Decimal(str(criterion.lower))) if criterion.operator=='>=' else Decimal(str(criterion.lower))<=v<=Decimal(str(criterion.upper))
            status='satisfied' if passed else 'unsatisfied';reason='按已发布判据比较（含端点）'
        items.append(EvaluationItem(key=key,name=name,value=value,unit=metric.unit if metric else 'mm',status=status,required=required,reason=reason,criterion=criterion))
    required=[item for item in items if item.required]
    status='unsatisfied' if any(i.status=='unsatisfied' for i in required) else 'unavailable' if not required or any(i.status=='unavailable' for i in required) else 'satisfied'
    is_test=response.provider.is_test or any(c.source=='simulation' for c in enabled)
    label={'satisfied':'该范围内满足','unsatisfied':'不满足','unavailable':'无法评价'}[status]
    return SafetyAssessment(status=status,scope='变形控制评价',tag=('临时测试 · ' if is_test else '')+label,
        reason='；'.join(f'{i.name}：{i.reason}' for i in items)+'。仅包含已定义变形指标，不包含支护承载结论。',
        response=response,items=items,criteria_snapshot=enabled,is_test=is_test,score=None,radar=None)
