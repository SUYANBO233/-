import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models import (
    DecisionMeta, DecisionPayload, DesignRequest, DesignResponse, GenerateRequest,
    InferRequest, InferResponse, RecheckRequest, SafetyAssessment, SaveDecisionRequest, SchemeReport,
    SynchronizeRequest, SynchronizeResponse, SupportOptionsResponse, RulePreviewRequest,
)
from app.services.decision import DecisionService


def get_service(request: Request) -> DecisionService:
    expected: str = request.app.state.settings.api_key
    if expected and not secrets.compare_digest(request.headers.get('X-Decision-Key',''), expected):
        raise HTTPException(status_code=401, detail='算法服务认证失败')
    service: DecisionService = request.app.state.make_decision_service()
    return service


Service = Annotated[DecisionService, Depends(get_service)]
router = APIRouter(prefix='/api/decision', tags=['decision'])


@router.post('/preview-rule')
def preview_rule(body: RulePreviewRequest,service: Service) -> dict[str,str]:
    from app.algorithms.rule_matching import match_rule
    return {'status':match_rule(body.rule,body.params),'reason':body.rule.reason,'version':service.algorithm.info.version}


@router.get('/meta', response_model=DecisionMeta)
def meta(service: Service) -> DecisionMeta:
    return service.meta()


@router.post('/synchronize', response_model=SynchronizeResponse)
def synchronize(body: SynchronizeRequest,service: Service) -> SynchronizeResponse:
    return service.synchronize(body)


@router.post('/support-options',response_model=SupportOptionsResponse)
def support_options(body: DesignRequest,service: Service) -> SupportOptionsResponse:
    return service.support_options(body)


@router.post('/infer-methods', response_model=InferResponse)
def infer_methods(body: InferRequest, service: Service) -> InferResponse:
    return service.infer(body)


@router.post('/design-support', response_model=DesignResponse)
def design_support(body: DesignRequest, service: Service) -> DesignResponse:
    return service.design(body)


@router.post('/recheck-safety', response_model=SafetyAssessment)
def recheck_safety(body: RecheckRequest, service: Service) -> SafetyAssessment:
    return service.assess(body)


@router.post('/generate-scheme', response_model=SchemeReport)
def generate_scheme(body: GenerateRequest, service: Service) -> SchemeReport:
    return service.report(body)


@router.post('/build-snapshot', response_model=DecisionPayload)
def build_snapshot(body: SaveDecisionRequest, service: Service) -> DecisionPayload:
    return service.snapshot(body)
