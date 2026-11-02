"""HTTP contracts. Camel-case JSON fields match src/lib/types.ts."""
from typing import Annotated, Literal
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator
from pydantic.alias_generators import to_camel

RockGrade = Literal['I', 'II', 'III', 'IV', 'V', 'VI']
MethodKey = Literal['full', 'bench', 'core']
ComponentKey = Literal['steel', 'shot', 'anchor', 'advance']
Number = Annotated[float, Field(allow_inf_nan=False)]


class Contract(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True,
                              extra='forbid', allow_inf_nan=False, strict=True)


class AlgorithmInfo(Contract):
    id: str = Field(min_length=1)
    version: str = Field(min_length=1)
    reference: bool
    description: str
    capabilities: list[str] = Field(default_factory=list)


class GeoParams(Contract):
    hardness: str = Field(min_length=1, max_length=80)
    integrity: str = Field(min_length=1, max_length=80)
    thickness: str = Field(min_length=1, max_length=80)
    water: str = Field(min_length=1, max_length=80)
    grade: RockGrade
    depth: Number = Field(ge=0, le=20000)
    section: str = Field(min_length=1, max_length=120)
    density: Number = Field(gt=0, le=10000)
    share_primary: Number = Field(ge=0, le=1)
    share_secondary: Number = Field(ge=0, le=1)
    friction: Number = Field(ge=0, le=90)
    elastic: Number = Field(gt=0)
    cohesion: Number = Field(ge=0)
    poisson: Number = Field(gt=-1, lt=0.5)
    stress_v: Number = Field(ge=0)
    stress_h: Number = Field(ge=0)


GEO_FIELDS_BY_ALIAS = {field.alias or name:field for name,field in GeoParams.model_fields.items()}


def normalize_geo_input(params: GeoParams | dict[str,object]) -> GeoParams | dict[str,object]:
    if isinstance(params,GeoParams):
        return params
    for name,value in params.items():
        if name not in GEO_FIELDS_BY_ALIAS:
            raise ValueError('unknown input field')
        field = GEO_FIELDS_BY_ALIAS[name]
        TypeAdapter(Annotated[field.annotation, *field.metadata] if field.metadata else field.annotation).validate_python(value,strict=True)
    return GeoParams.model_validate(params) if set(params) == set(GEO_FIELDS_BY_ALIAS) else params


def geo_values(params: GeoParams | dict[str,object]) -> dict[str,object]:
    return params.model_dump(by_alias=True) if isinstance(params,GeoParams) else dict(params)



class ConstructionMethod(Contract):
    key: MethodKey
    name: str
    rock: str
    cycle: str
    adv: str
    shot: str
    month: str
    desc: str
    equip: str


class MethodMatch(ConstructionMethod):
    score: Number | None = Field(default=None, ge=0, le=100)
    status: Literal["recommended", "candidate", "inapplicable", "insufficient", "uncovered"] | None = None
    reasons: list[str] = Field(default_factory=list)
    rules: list[dict[str, str | int]] = Field(default_factory=list)
    priority: int | None = None
    matched: bool


class SupportComponent(Contract):
    key: ComponentKey
    label: str
    spec: str
    layout: str
    val_num: Number = Field(gt=0)
    unit: str
    basis: str
    conf: Number | None = Field(default=None, ge=0, le=1)
    parameters: dict[str, str | float] | None = None
    color: str


class ArchMechanism(Contract):
    height: str
    release: str
    close_time: str


class SafetyRadar(Contract):
    labels: list[str] = Field(min_length=1)
    data: list[Annotated[float, Field(ge=0, le=100)]] = Field(min_length=1)

    @model_validator(mode='after')
    def same_length(self) -> 'SafetyRadar':
        if len(self.labels) != len(self.data):
            raise ValueError('radar labels and data must have the same length')
        return self


class SafetyAssessment(Contract):
    status: Literal["reference", "unavailable", "satisfied", "unsatisfied"] = "reference"
    scope: str = "参考评分"
    score: Number | None = Field(default=None, ge=0, le=100)
    tag: str
    reason: str
    radar: SafetyRadar | None = None
    algorithm: AlgorithmInfo | None = None


class SchemeRow(Contract):
    process: str
    spec: str
    quantity: str
    basis: str


class SchemeReport(Contract):
    no: str
    time: str
    mile: str
    grade: str
    method: str
    rows: list[SchemeRow] = Field(min_length=1)
    algorithm: AlgorithmInfo | None = None


class WorkfaceOption(Contract):
    value: str
    label: str
    grade: RockGrade


class MileageOption(Contract):
    value: str
    label: str
    mile: str


class DecisionMeta(Contract):
    workfaces: list[WorkfaceOption]
    mileages: list[MileageOption]
    algorithm: AlgorithmInfo | None = None


class TemplateReference(Contract):
    code: str
    version: int = Field(gt=0)


class InferRequest(Contract):
    algorithm: AlgorithmInfo | None = None
    observation_id: str | None = None
    manual_reason: str = Field(default="", max_length=500)
    params: GeoParams | dict[str,object]
    workface: str | None = None
    mileage: str | None = None

    @model_validator(mode='after')
    def valid_geo_input(self) -> 'InferRequest':
        self.params = normalize_geo_input(self.params)
        return self


class DesignRequest(InferRequest):
    method_key: MethodKey
    template: TemplateReference | None = None


class RecheckRequest(DesignRequest):
    support: list[SupportComponent] = Field(min_length=4, max_length=4)

    @model_validator(mode='after')
    def unique_components(self) -> 'RecheckRequest':
        if {item.key for item in self.support} != {'steel', 'shot', 'anchor', 'advance'}:
            raise ValueError('support requires steel, shot, anchor and advance exactly once')
        limits = {'steel': 1000, 'shot': 200, 'anchor': 100, 'advance': 1000}
        for item in self.support:
            if item.val_num > limits[item.key]:
                raise ValueError(f'{item.key} value exceeds the supported input range')
        return self


class GenerateRequest(RecheckRequest):
    mileage: str = Field(pattern=r'^K\d{1,8}\+\d{1,3}(?:\.\d{1,3})?$')


class InferResponse(Contract):
    methods: list[MethodMatch] = Field(min_length=1)
    algorithm: AlgorithmInfo


class DesignResponse(Contract):
    support: list[SupportComponent] = Field(min_length=4, max_length=4)
    safety: SafetyAssessment
    mechanism: ArchMechanism | None = None
    template: TemplateReference | None = None
    algorithm: AlgorithmInfo


class SupportValues(Contract):
    steel: Number = Field(gt=0, le=1000)
    shot: Number = Field(gt=0, le=200)
    anchor: Number = Field(gt=0, le=100)
    advance: Number = Field(gt=0, le=1000)


class RevisionInput(Contract):
    template: TemplateReference | None = None
    manual_reason: str = Field(default="", max_length=500)
    method_key: MethodKey
    values: SupportValues
    reason: str = Field(min_length=1, max_length=200)


class SaveDecisionRequest(Contract):
    observation_id: str | None = None
    request_key: str = Field(min_length=36, max_length=36)
    mode: Literal['joint', 'manual']
    workface: str = Field(pattern=r'^[a-z][a-z0-9_]{0,79}$')
    mileage: str = Field(pattern=r'^K\d{1,8}\+\d{1,3}(?:\.\d{1,3})?$')
    params: GeoParams | dict[str,object]
    revisions: list[RevisionInput] = Field(min_length=1, max_length=1000)
    algorithm: AlgorithmInfo | None = None

    @model_validator(mode='after')
    def valid_request_key(self) -> 'SaveDecisionRequest':
        UUID(self.request_key)
        self.params = normalize_geo_input(self.params)
        return self


class RevisionSnapshot(Contract):
    template: dict[str, object] | None = None
    rules: list[dict[str, object]] = Field(default_factory=list)
    method_key: MethodKey
    support: list[SupportComponent]
    safety: SafetyAssessment
    reason: str


class InputSnapshot(Contract):
    origin: dict[str, object] | None = None
    params: GeoParams | dict[str,object]
    mileage: str
    workface: str


class ReportSnapshot(Contract):
    schema_version: int = 2
    mile: str
    grade: str
    method: str
    rows: list[SchemeRow]
    algorithm: AlgorithmInfo


class DecisionPayload(Contract):
    request_key: str
    workface: str
    mode: Literal['joint', 'manual']
    channel: Literal['mock', 'real']
    algorithm_version: str
    source: Literal['simulation', 'algorithm']
    input: InputSnapshot
    candidates: list[MethodMatch]
    revisions: list[RevisionSnapshot]
    report: ReportSnapshot


class Condition(Contract):
    field: str
    op: Literal['eq', 'in', 'range']
    value: str | Number | None = None
    values: list[str | Number] | None = None
    min: Number | None = None
    max: Number | None = None
    min_inclusive: bool = True
    max_inclusive: bool = False

    @model_validator(mode='after')
    def valid_condition(self) -> 'Condition':
        if self.field not in GEO_FIELDS_BY_ALIAS:
            raise ValueError('unknown input field')
        numeric = self.field not in ('hardness','integrity','thickness','water','grade','section')
        if self.op == 'range':
            if not numeric or (self.min is None and self.max is None) or (self.min is not None and self.max is not None and self.min >= self.max):
                raise ValueError('invalid numeric interval')
            if self.value is not None or self.values is not None:
                raise ValueError('range cannot include category values')
        else:
            values = [self.value] if self.op == 'eq' else self.values
            if not values or any(value is None or (isinstance(value,str) == numeric) for value in values):
                raise ValueError('condition value type does not match field')
            if self.min is not None or self.max is not None or (self.op == 'eq' and self.values is not None) or (self.op == 'in' and self.value is not None):
                raise ValueError('unexpected condition operands')
        return self


class Conditions(Contract):
    all: list[Condition] = Field(min_length=1,max_length=30)
    exclude_any: list[Condition] = Field(default_factory=list,max_length=30)


class DecisionRule(Contract):
    code: str = Field(pattern=r'^[a-z][a-z0-9_]{0,79}$')
    version: int = Field(gt=0)
    name: str = Field(min_length=1)
    kind: Literal['method','support']
    method_key: MethodKey
    priority: int = Field(ge=0,le=100000)
    enabled: bool
    conditions: Conditions
    reason: str = Field(min_length=1)
    template_code: str | None = None
    template_version: int | None = Field(default=None,gt=0)
    source: Literal['manual','import','simulation']
    test_batch_id: str | None = None

    @model_validator(mode='after')
    def valid_target(self) -> 'DecisionRule':
        if self.kind == 'support' and (not self.template_code or self.template_version is None):
            raise ValueError('support rule requires a versioned template')
        if self.kind == 'method' and (self.template_code is not None or self.template_version is not None):
            raise ValueError('method rule cannot reference a template')
        if self.source == 'simulation' and not self.test_batch_id:
            raise ValueError('synthetic rule requires testBatchId')
        return self


class SteelParameters(Contract):
    model: str = Field(min_length=1)
    spacing_cm: Number = Field(gt=0,le=1000)


class ShotParameters(Contract):
    strength: str = Field(min_length=1)
    thickness_cm: Number = Field(gt=0,le=200)


class AnchorParameters(Contract):
    type: str = Field(min_length=1)
    diameter_mm: Number = Field(gt=0)
    length_m: Number = Field(gt=0,le=100)
    longitudinal_spacing_cm: Number = Field(gt=0)
    circumferential_spacing_cm: Number = Field(gt=0)


class AdvanceParameters(Contract):
    type: str = Field(min_length=1)
    diameter_mm: Number = Field(gt=0)
    length_m: Number = Field(gt=0)
    ring_spacing_cm: Number = Field(gt=0,le=1000)
    scope: str = Field(min_length=1)


class StructuredSupport(Contract):
    steel: SteelParameters
    shot: ShotParameters
    anchor: AnchorParameters
    advance: AdvanceParameters

    @model_validator(mode='after')
    def meaningful_specifications(self) -> 'StructuredSupport':
        for component in (self.steel,self.shot,self.anchor,self.advance):
            if any(isinstance(value,str) and not value.strip() for value in component.model_dump().values()):
                raise ValueError('empty specification')
        return self


class SupportTemplate(Contract):
    code: str = Field(pattern=r'^[a-z][a-z0-9_]{0,79}$')
    version: int = Field(gt=0)
    name: str = Field(min_length=1,max_length=40)
    enabled: bool
    parameters: StructuredSupport
    source: Literal['manual','import','simulation']
    test_batch_id: str | None = None


class GeoObservation(Contract):
    id: str
    workface: str
    mileage: str = Field(pattern=r'^K\d{1,8}\+\d{1,3}(?:\.\d{1,3})?$')
    observed_at: str
    params: dict[str, object]
    source: Literal['manual','import','simulation']
    test_batch_id: str | None = None

    @model_validator(mode='after')
    def validate_values(self) -> 'GeoObservation':
        UUID(self.id)
        timestamp = datetime.fromisoformat(self.observed_at.replace('Z','+00:00'))
        if timestamp.tzinfo is None:
            raise ValueError('observation time requires timezone')
        for name, value in self.params.items():
            if name not in GEO_FIELDS_BY_ALIAS:
                raise ValueError('unknown observation parameter')
            field = GEO_FIELDS_BY_ALIAS[name]
            TypeAdapter(Annotated[field.annotation, *field.metadata] if field.metadata else field.annotation).validate_python(value,strict=True)
        if self.source == 'simulation' and not self.test_batch_id:
            raise ValueError('synthetic observation requires testBatchId')
        return self


class SynchronizeRequest(Contract):
    workface: str
    mileage: str = Field(pattern=r'^K\d{1,8}\+\d{1,3}(?:\.\d{1,3})?$')
    at: str | None = None


class SynchronizeResponse(Contract):
    status: Literal['found','not_found','conflict','incomplete']
    observation: GeoObservation | None = None
    candidates: list[GeoObservation] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    message: str
    algorithm: AlgorithmInfo


class SupportOptionsResponse(Contract):
    options: list[SupportTemplate]
    algorithm: AlgorithmInfo


class RulePreviewRequest(Contract):
    rule: DecisionRule
    params: dict[str,object]

    @model_validator(mode='after')
    def validate_params(self) -> 'RulePreviewRequest':
        for name,value in self.params.items():
            if name not in GEO_FIELDS_BY_ALIAS:
                raise ValueError('unknown input field')
            field = GEO_FIELDS_BY_ALIAS[name]
            TypeAdapter(Annotated[field.annotation, *field.metadata] if field.metadata else field.annotation).validate_python(value,strict=True)
        return self


class Catalog(Contract):
    methods: list[ConstructionMethod] = Field(min_length=1)
    meta: DecisionMeta
    support_by_grade: dict[RockGrade, list[SupportComponent]]
    rules: list[DecisionRule] = Field(default_factory=list)
    templates: list[SupportTemplate] = Field(default_factory=list)
    observations: list[GeoObservation] = Field(default_factory=list)
    data_source: str = "reference"

    @model_validator(mode='after')
    def complete_catalog(self) -> 'Catalog':
        if {item.key for item in self.methods} != {'full', 'bench', 'core'} or len(self.methods) != 3:
            raise ValueError('catalog requires exactly three unique method keys')
        for components in self.support_by_grade.values():
            if len(components) != 4 or {item.key for item in components} != {'steel','shot','anchor','advance'}:
                raise ValueError('each support template requires four unique components')
        return self
