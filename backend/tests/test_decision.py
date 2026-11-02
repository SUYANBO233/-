from dataclasses import replace
import json
import unittest

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.common import PARAMS, save_request


class DecisionApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(create_app(Settings()), raise_server_exceptions=False)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def design(self) -> dict:
        response = self.client.post('/api/decision/design-support', json={'params': PARAMS, 'methodKey': 'bench'})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_health_and_meta(self) -> None:
        self.assertEqual(self.client.get('/health').json()['status'], 'ok')
        data = self.client.get('/api/decision/meta').json()
        self.assertEqual(len(data['workfaces']), 2)
        self.assertTrue(data['algorithm']['reference'])

    def test_inference_all_grades(self) -> None:
        for grade, key in [('I','full'),('II','full'),('III','full'),('IV','bench'),('V','core'),('VI','core')]:
            with self.subTest(grade=grade):
                response = self.client.post('/api/decision/infer-methods', json={'params': {**PARAMS,'grade':grade}})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual([item['key'] for item in response.json()['methods'] if item['matched']], [key])

    def test_iv_and_v_templates_match_existing_project(self) -> None:
        for grade, method, score, steel in [('IV','bench',91.3,80), ('V','core',85.8,60)]:
            response = self.client.post('/api/decision/design-support', json={'params': {**PARAMS,'grade':grade},'methodKey':method})
            self.assertEqual(response.status_code, 200, response.text)
            data = response.json()
            self.assertEqual(data['safety']['score'], score)
            self.assertEqual(next(item['valNum'] for item in data['support'] if item['key']=='steel'), steel)
            self.assertIn('closeTime', data['mechanism'])
            self.assertTrue(data['safety']['algorithm']['reference'])

    def test_recheck_responds_to_adjustment(self) -> None:
        design = self.design()
        support = design['support']
        next(item for item in support if item['key']=='steel')['valNum'] = 160
        response = self.client.post('/api/decision/recheck-safety', json={'params': PARAMS,'methodKey':'bench','support':support})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertLess(response.json()['score'], design['safety']['score'])
        self.assertIn('不能据此认定结构安全', response.json()['reason'])

    def test_report_uses_supplied_configuration(self) -> None:
        support = self.design()['support']
        response = self.client.post('/api/decision/generate-scheme', json={'params':PARAMS,'methodKey':'bench','mileage':'K3601+200','support':support})
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data['mile'], 'K3601+200')
        self.assertEqual(data['method'], '台阶法')
        self.assertTrue(data['no'].startswith('预览-'))
        self.assertTrue(data['algorithm']['reference'])

    def test_unsupported_design_domain_is_explicit(self) -> None:
        response = self.client.post('/api/decision/design-support', json={'params': {**PARAMS,'grade':'VI'},'methodKey':'core'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('仅覆盖', response.json()['message'])

    def test_invalid_numbers_unknown_fields_and_duplicate_components(self) -> None:
        for params in [{**PARAMS,'depth':-1}, {**PARAMS,'poisson':0.5}, {**PARAMS,'density':True}, {**PARAMS,'depth':'620'}, {**PARAMS,'unexpected':1}]:
            response = self.client.post('/api/decision/infer-methods', json={'params':params})
            self.assertEqual(response.status_code, 422, response.text)
        response = self.client.post('/api/decision/infer-methods', content=json.dumps({'params':{**PARAMS,'density':float('nan')}}), headers={'Content-Type':'application/json'})
        self.assertEqual(response.status_code, 422)
        support = self.design()['support']
        support[1] = support[0]
        response = self.client.post('/api/decision/recheck-safety', json={'params':PARAMS,'methodKey':'bench','support':support})
        self.assertEqual(response.status_code, 422)
        support = self.design()['support']
        support[0]['valNum'] = 0
        self.assertEqual(self.client.post('/api/decision/recheck-safety', json={'params':PARAMS,'methodKey':'bench','support':support}).status_code, 422)

    def test_snapshot_is_deterministic_and_source_is_server_owned(self) -> None:
        request = save_request()
        request['revisions'].append({'methodKey':'bench','reason':'调整','values':{'steel':60,'shot':24,'anchor':3.5,'advance':35}})
        first = self.client.post('/api/decision/build-snapshot', json=request)
        self.assertEqual(first.status_code, 200, first.text)
        second = self.client.post('/api/decision/build-snapshot', json=request)
        self.assertEqual(first.json(), second.json())
        data = first.json()
        self.assertEqual(len(data['revisions']), 2)
        self.assertEqual(data['source'], 'simulation')
        self.assertEqual(data['channel'], 'mock')
        self.assertEqual(data['algorithmVersion'], 'reference-rules:1.0.0')
        self.assertNotIn('no', data['report'])
        request['source'] = 'measured'
        self.assertEqual(self.client.post('/api/decision/build-snapshot', json=request).status_code, 422)

    def test_algorithm_version_conflict(self) -> None:
        request = save_request()
        request['algorithm'] = {**self.client.get('/api/decision/meta').json()['algorithm'],'version':'old-version'}
        self.assertEqual(self.client.post('/api/decision/build-snapshot', json=request).status_code, 409)

    def test_optional_service_authentication(self) -> None:
        with TestClient(create_app(replace(Settings(),api_key='local-test-key'))) as client:
            self.assertEqual(client.get('/api/decision/meta').status_code, 401)
            self.assertEqual(client.get('/api/decision/meta',headers={'X-Decision-Key':'local-test-key'}).status_code, 200)

    def test_plugin_factory_replaces_algorithm_without_changing_routes(self) -> None:
        with TestClient(create_app(replace(Settings(),algorithm_factory='tests.custom_algorithm:create_algorithm'))) as client:
            response = client.post('/api/decision/infer-methods',json={'params':PARAMS})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['algorithm']['id'], 'custom-example')
            self.assertEqual([item['key'] for item in response.json()['methods'] if item['matched']], ['core'])

    def test_invalid_plugin_fails_at_startup(self) -> None:
        with self.assertRaises((ValueError, TypeError, AttributeError)):
            with TestClient(create_app(replace(Settings(), algorithm_factory='app.config:ROOT'))):
                pass


if __name__ == '__main__':
    unittest.main()
