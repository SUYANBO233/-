"""Emit response fixtures over ASGI, without opening a network port."""
import json
import sys
from pathlib import Path
from app.models import Catalog
from app.repositories.catalog import FrozenCatalogRepository

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.common import PARAMS, save_request


def contract_cases(d1: bool = False, d2: bool = False) -> dict:
    if d1:
        catalog = Catalog.model_validate_json((Path(__file__).resolve().parents[2]/('tests/fixtures/d2-catalog.json' if d2 else 'tests/fixtures/d1-catalog.json')).read_text())
        application = create_app(Settings(response_factory='app.algorithms.response.test_provider:create_provider',allow_test_responses=True) if d2 else Settings(),repository=FrozenCatalogRepository(catalog))
    else:
        application = create_app(Settings(algorithm_factory='app.algorithms.reference:create_algorithm'))
    with TestClient(application) as client:
        def post(operation: str, body: dict) -> dict:
            response = client.post(f'/api/decision/{operation}',json=body)
            response.raise_for_status()
            return response.json()
        meta = client.get('/api/decision/meta').json()
        context={'evaluationContext':{'sectionId':'test-section-a','stage':'initial-support','displacementReference':'since-excavation'}} if d2 else {}
        inference = post('infer-methods', {'params':PARAMS,**context})
        design = post('design-support', {'params':PARAMS,'methodKey':'bench',**context})
        request = {**context,'params':PARAMS,'methodKey':'bench','support':design['support']}
        safety = post('recheck-safety',request)
        report = post('generate-scheme',{**request,'mileage':'K3601+200'})
        save = {**save_request(),**context}
        save['requestKey'] = '9348484b-2e51-44c6-a27b-5b6fe22cfe53'
        save['algorithm'] = meta['algorithm']
        if d1:
            save['workface'] = 'test_face_a'
            save['observationId'] = '10000000-0000-4000-8000-000000000001'
            save['revisions'][0]['template'] = {'code':'test_iv_main','version':1}
        snapshot = post('build-snapshot',save)
        cases = {'meta':meta,'inference':inference,'design':design,'safety':safety,'report':report,'save':save,'snapshot':snapshot}
        if d1:
            cases['synchronize'] = post('synchronize',{'workface':'test_face_a','mileage':'K3601+200'})
            cases['options'] = post('support-options',{'params':PARAMS,'methodKey':'bench',**context})
        return cases


if __name__ == '__main__':
    if '--snapshot-only' in sys.argv:
        from app.repositories.catalog import JsonCatalogRepository
        from app.algorithms.reference import ReferenceAlgorithm
        from app.models import SaveDecisionRequest
        from app.services.decision import DecisionService
        repository = JsonCatalogRepository(Settings().catalog_path)
        algorithm = ReferenceAlgorithm(repository)
        request = save_request()
        request['requestKey'] = '9348484b-2e51-44c6-a27b-5b6fe22cfe53'
        request['algorithm'] = algorithm.info.model_dump(by_alias=True)
        data = DecisionService(algorithm, repository).snapshot(SaveDecisionRequest.model_validate(request)).model_dump(by_alias=True)
    else:
        data = contract_cases(d1='--d1' in sys.argv or '--d2' in sys.argv,d2='--d2' in sys.argv)
    print(json.dumps(data,ensure_ascii=False))
