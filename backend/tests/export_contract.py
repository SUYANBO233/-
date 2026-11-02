"""Emit response fixtures over ASGI, without opening a network port."""
import json
import sys

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.common import PARAMS, save_request


def contract_cases() -> dict:
    with TestClient(create_app(Settings())) as client:
        def post(operation: str, body: dict) -> dict:
            response = client.post(f'/api/decision/{operation}',json=body)
            response.raise_for_status()
            return response.json()
        meta = client.get('/api/decision/meta').json()
        inference = post('infer-methods', {'params':PARAMS})
        design = post('design-support', {'params':PARAMS,'methodKey':'bench'})
        request = {'params':PARAMS,'methodKey':'bench','support':design['support']}
        safety = post('recheck-safety',request)
        report = post('generate-scheme',{**request,'mileage':'K3601+200'})
        save = save_request()
        save['requestKey'] = '9348484b-2e51-44c6-a27b-5b6fe22cfe53'
        save['algorithm'] = meta['algorithm']
        snapshot = post('build-snapshot',save)
        return {'meta':meta,'inference':inference,'design':design,'safety':safety,'report':report,'save':save,'snapshot':snapshot}


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
        data = contract_cases()
    print(json.dumps(data,ensure_ascii=False))
