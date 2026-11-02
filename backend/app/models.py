"""HTTP contracts. Camel-case JSON fields match src/lib/types.ts."""
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
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
    score: Number = Field(ge=0, le=100)
    matched: bool


class SupportComponent(Contract):
    key: ComponentKey
    label: str
    spec: str
    layout: str
    val_num: Number = Field(gt=0)
    unit: str
    basis: str
    conf: Number = Field(ge=0, le=1)
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
    score: Number = Field(ge=0, le=100)
    tag: str
    reason: str
    radar: SafetyRadar
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
    workfaces: list[WorkfaceOption] = Field(min_length=1)
    mileages: list[MileageOption] = Field(min_length=1)
    algorithm: AlgorithmInfo | None = None


class InferRequest(Contract):
    params: GeoParams
    workface: str | None = None
    mileage: str | None = None


class DesignRequest(InferRequest):
    method_key: MethodKey


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
    mechanism: ArchMechanism
    algorithm: AlgorithmInfo


class SupportValues(Contract):
    steel: Number = Field(gt=0, le=1000)
    shot: Number = Field(gt=0, le=200)
    anchor: Number = Field(gt=0, le=100)
    advance: Number = Field(gt=0, le=1000)


class RevisionInput(Contract):
    method_key: MethodKey
    values: SupportValues
    reason: str = Field(min_length=1, max_length=200)


class SaveDecisionRequest(Contract):
    request_key: str = Field(min_length=36, max_length=36)
    mode: Literal['joint', 'manual']
    workface: str = Field(pattern=r'^[a-z][a-z0-9_]{0,79}$')
    mileage: str = Field(pattern=r'^K\d{1,8}\+\d{1,3}(?:\.\d{1,3})?$')
    params: GeoParams
    revisions: list[RevisionInput] = Field(min_length=1, max_length=1000)
    algorithm: AlgorithmInfo | None = None

    @model_validator(mode='after')
    def valid_request_key(self) -> 'SaveDecisionRequest':
        UUID(self.request_key)
        return self


class RevisionSnapshot(Contract):
    method_key: MethodKey
    support: list[SupportComponent]
    safety: SafetyAssessment
    reason: str


class InputSnapshot(Contract):
    params: GeoParams
    mileage: str
    workface: str


class ReportSnapshot(Contract):
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


class Catalog(Contract):
    methods: list[ConstructionMethod] = Field(min_length=1)
    meta: DecisionMeta
    support_by_grade: dict[RockGrade, list[SupportComponent]]

    @model_validator(mode='after')
    def complete_catalog(self) -> 'Catalog':
        if {item.key for item in self.methods} != {'full', 'bench', 'core'} or len(self.methods) != 3:
            raise ValueError('catalog requires exactly three unique method keys')
        for components in self.support_by_grade.values():
            if len(components) != 4 or {item.key for item in components} != {'steel','shot','anchor','advance'}:
                raise ValueError('each support template requires four unique components')
        return self
