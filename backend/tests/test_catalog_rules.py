from copy import deepcopy
import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app.models import Catalog, Condition
from app.repositories.catalog import FrozenCatalogRepository
from app.algorithms.rule_matching import matches
from tests.common import PARAMS, save_request

FIXTURE = Path(__file__).resolve().parents[2] / 'tests/fixtures/d1-catalog.json'


class CatalogRuleTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(FIXTURE.read_text())
        self.catalog = Catalog.model_validate(self.data)
        self.client = self.client_for(self.catalog)

    def client_for(self,catalog):
        client = TestClient(create_app(Settings(),repository=FrozenCatalogRepository(catalog)),raise_server_exceptions=False)
        client.__enter__()
        self.addCleanup(client.__exit__,None,None,None)
        return client

    def infer(self,params=None):
        response = self.client.post('/api/decision/infer-methods',json={'params':params or PARAMS})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def test_rule_recommendation_has_reasons_without_invented_score(self):
        data = self.infer()
        self.assertEqual([item['key'] for item in data['methods'] if item['matched']],['bench'])
        item = next(item for item in data['methods'] if item['key']=='bench')
        self.assertIsNone(item['score'])
        self.assertEqual(item['rules'][0]['code'],'test_method_iv')

    def test_only_fields_needed_by_rules_are_required_for_d1(self):
        params = {'grade':'IV','water':'潮湿','section':'主洞标准断面'}
        result = self.infer(params)
        self.assertEqual([item['key'] for item in result['methods'] if item['matched']],['bench'])
        design = self.client.post('/api/decision/design-support',json={'params':params,'methodKey':'bench'})
        self.assertEqual(design.status_code,200,design.text)
        self.assertEqual(design.json()['safety']['status'],'unavailable')
        incomplete = self.infer({'grade':'IV'})
        self.assertFalse(any(item['matched'] for item in incomplete['methods']))
        self.assertEqual(next(item for item in incomplete['methods'] if item['key']=='bench')['status'],'insufficient')

    def test_ties_no_match_and_hard_exclusion(self):
        tie = self.infer({**PARAMS,'depth':800})
        self.assertEqual({item['key'] for item in tie['methods'] if item['matched']},{'bench','core'})
        no_match = self.infer({**PARAMS,'grade':'VI'})
        self.assertFalse(any(item['matched'] for item in no_match['methods']))
        excluded = self.infer({**PARAMS,'water':'涌水'})
        self.assertEqual(next(item for item in excluded['methods'] if item['key']=='bench')['status'],'inapplicable')
        response = self.client.post('/api/decision/design-support',json={'params':{**PARAMS,'water':'涌水'},'methodKey':'bench','manualReason':'不能覆盖硬排除'})
        self.assertEqual(response.status_code,400)

    def test_range_endpoints_and_missing_are_explicit(self):
        condition = Condition(field='depth',op='range',min=100,max=200)
        self.assertFalse(matches(condition,{'depth':99}))
        self.assertTrue(matches(condition,{'depth':100}))
        self.assertFalse(matches(condition,{'depth':200}))
        self.assertIsNone(matches(condition,{}))
        rule = self.data['rules'][1]
        rule['conditions']['all'].append({'field':'depth','op':'range','min':100,'max':200})
        result = self.client.post('/api/decision/preview-rule',json={'rule':rule,'params':{'grade':'IV'}})
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['status'],'insufficient')

    def test_invalid_rules_and_templates_are_rejected(self):
        for change in [{'field':'unknown','op':'eq','value':1},{'field':'depth','op':'range','min':200,'max':100},
                       {'field':'depth','op':'eq','value':'620'},{'field':'grade','op':'in','values':[]}]:
            data = deepcopy(self.data)
            data['rules'][0]['conditions']['all'] = [change]
            with self.assertRaises(ValueError):
                Catalog.model_validate(data)
        data = deepcopy(self.data)
        del data['templates'][0]['parameters']['anchor']['diameterMm']
        with self.assertRaises(ValueError):
            Catalog.model_validate(data)

    def test_synchronization_uses_exact_position_time_and_source(self):
        response = self.client.post('/api/decision/synchronize',json={'workface':'test_face_a','mileage':'K3601+200','at':'2026-11-02T00:00:00Z'})
        self.assertEqual(response.status_code,200,response.text)
        data = response.json()
        self.assertEqual(data['status'],'found')
        self.assertEqual(data['observation']['params']['depth'],620)
        self.assertEqual(data['observation']['source'],'simulation')
        self.assertEqual(data['observation']['testBatchId'],'d1_synthetic_v1')
        conflict = self.client.post('/api/decision/synchronize',json={'workface':'test_face_a','mileage':'K3601+900'})
        self.assertEqual(conflict.json()['status'],'conflict')
        incomplete = self.client.post('/api/decision/synchronize',json={'workface':'test_face_b','mileage':'K3600+450'})
        self.assertEqual(incomplete.json()['status'],'incomplete')
        self.assertIn('elastic',incomplete.json()['missing'])
        absent = self.client.post('/api/decision/synchronize',json={'workface':'test_face_a','mileage':'K3599+050'})
        self.assertEqual(absent.json()['status'],'not_found')
        self.assertIsNone(absent.json()['observation'])

    def test_complete_support_manual_values_and_unavailable_evaluation(self):
        design = self.client.post('/api/decision/design-support',json={'params':PARAMS,'methodKey':'bench'})
        self.assertEqual(design.status_code,200,design.text)
        data = design.json()
        self.assertEqual(data['template'],{'code':'test_iv_main','version':1})
        self.assertEqual(next(item for item in data['support'] if item['key']=='anchor')['parameters']['diameterMm'],22)
        self.assertEqual(data['safety']['status'],'unavailable')
        self.assertIsNone(data['safety']['score'])
        self.assertIsNone(data['mechanism'])
        next(item for item in data['support'] if item['key']=='anchor')['valNum'] = 3.7
        report = self.client.post('/api/decision/generate-scheme',json={'params':PARAMS,'methodKey':'bench','template':data['template'],'mileage':'K3601+200','support':data['support']})
        self.assertEqual(report.status_code,200,report.text)
        self.assertTrue(any('3.7' in row['quantity'] for row in report.json()['rows']))

    def test_template_tie_requires_choice_and_disabled_template_is_not_used(self):
        data = deepcopy(self.data)
        extra = deepcopy(data['rules'][4])
        extra.update(code='test_extra_template',templateCode='test_v_alternative')
        data['rules'].append(extra)
        client = self.client_for(Catalog.model_validate(data))
        request = {'params':PARAMS,'methodKey':'bench'}
        options = client.post('/api/decision/support-options',json=request)
        self.assertEqual(len(options.json()['options']),2)
        self.assertEqual(client.post('/api/decision/design-support',json=request).status_code,400)
        request['template'] = {'code':'test_v_alternative','version':1}
        self.assertEqual(client.post('/api/decision/design-support',json=request).status_code,200)
        request['template'] = {'code':'test_disabled','version':1}
        self.assertEqual(client.post('/api/decision/design-support',json=request).status_code,400)

    def test_catalog_changes_require_new_inference_and_history_snapshot_is_complete(self):
        original = self.infer()['algorithm']
        self.catalog.rules[1].enabled = False
        changed = self.client_for(self.catalog)
        stale = changed.post('/api/decision/design-support',json={'params':PARAMS,'methodKey':'bench','algorithm':original})
        self.assertEqual(stale.status_code,409,stale.text)
        request = save_request()
        request.update(workface='test_face_a',observationId='10000000-0000-4000-8000-000000000001',algorithm=original)
        request['revisions'][0]['template'] = {'code':'test_iv_main','version':1}
        response = self.client.post('/api/decision/build-snapshot',json=request)
        self.assertEqual(response.status_code,200,response.text)
        result = response.json()
        self.assertEqual(result['input']['origin']['source'],'simulation')
        self.assertEqual(result['revisions'][0]['template']['code'],'test_iv_main')
        self.assertEqual(result['revisions'][0]['rules'][0]['version'],1)
        self.assertIsNone(result['revisions'][0]['safety']['score'])
        self.assertEqual(result,self.client.post('/api/decision/build-snapshot',json=request).json())


if __name__ == '__main__':
    unittest.main()
