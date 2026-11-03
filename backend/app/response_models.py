"""Versioned deformation contracts, independent from recommendation contracts."""
from typing import Literal
from pydantic import Field, model_validator
from app.models_base import Contract, Number

MetricKey = Literal['settlement','convergence']

class EvaluationContext(Contract):
    section_id: str = Field(min_length=1,max_length=100)
    stage: Literal['initial-support','after-excavation']
    displacement_reference: Literal['since-excavation','total']

class ProviderInfo(Contract):
    id: str
    version: str
    is_test: bool
    test_batch_id: str | None = None
    description: str

class ResponseMetric(Contract):
    key: MetricKey
    value: Number | None = Field(default=None,ge=0)
    unit: str = 'mm'
    reason: str = ''

class ResponseResult(Contract):
    status: Literal['available','partial','unavailable']
    provider: ProviderInfo
    context: EvaluationContext | None
    input_digest: str
    source: Literal['simulation','model','unavailable']
    metrics: list[ResponseMetric]
    reason: str


    @model_validator(mode='after')
    def consistent_result(self) -> 'ResponseResult':
        keys=[item.key for item in self.metrics]
        if len(keys)!=len(set(keys)):
            raise ValueError('duplicate response metric')
        if self.status=='available' and (set(keys)!={'settlement','convergence'} or any(item.value is None for item in self.metrics)):
            raise ValueError('available response requires both metrics')
        if self.status=='unavailable' and (self.source!='unavailable' or any(item.value is not None for item in self.metrics)):
            raise ValueError('unavailable response cannot carry current values')
        if self.status!='unavailable' and (self.source=='unavailable' or (self.source=='simulation')!=self.provider.is_test):
            raise ValueError('inconsistent response provenance')
        return self

class EvaluationCriterion(Contract):
    code: str = Field(pattern=r'^[a-z][a-z0-9_]{0,79}$')
    version: int = Field(gt=0)
    enabled: bool
    metric: MetricKey
    name: str = Field(min_length=1,max_length=100)
    unit: Literal['mm']
    stage: Literal['initial-support','after-excavation']
    displacement_reference: Literal['since-excavation','total']
    section_types: list[str] = Field(min_length=1,max_length=30)
    operator: Literal['<=','>=','range']
    lower: Number | None = Field(default=None,ge=0)
    upper: Number | None = Field(default=None,ge=0)
    required: bool
    basis: str = Field(min_length=1,max_length=1000)
    source: Literal['manual','import','simulation']
    test_batch_id: str | None = None

    @model_validator(mode='after')
    def valid_bounds(self) -> 'EvaluationCriterion':
        if self.operator == '<=' and (self.upper is None or self.lower is not None):
            raise ValueError('upper required for <=')
        if self.operator == '>=' and (self.lower is None or self.upper is not None):
            raise ValueError('lower required for >=')
        if self.operator == 'range' and (self.lower is None or self.upper is None or self.lower > self.upper):
            raise ValueError('ordered inclusive bounds required')
        if self.source == 'simulation' and not self.test_batch_id:
            raise ValueError('testBatchId required for simulation')
        if not self.name.strip() or not self.basis.strip() or any(not item.strip() for item in self.section_types):
            raise ValueError('blank criterion text')
        return self

class EvaluationItem(Contract):
    key: MetricKey
    name: str
    value: Number | None
    unit: str
    status: Literal['satisfied','unsatisfied','unavailable']
    required: bool
    reason: str
    criterion: EvaluationCriterion | None
