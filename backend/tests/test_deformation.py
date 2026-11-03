from copy import deepcopy
import json
from pathlib import Path
import time
import unittest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app.models import Catalog, RecheckRequest, StructuredSupport, SupportValues
from app.response_models import EvaluationContext
from app.algorithms.configurable import ConfigurableAlgorithm
from app.algorithms.evaluation import evaluate
from app.algorithms.response.test_provider import SyntheticProvider
from app.algorithms.response.base import load_provider, predict_bounded
from app.repositories.catalog import FrozenCatalogRepository
from tests.common import PARAMS,save_request

CONTEXT={'sectionId':'test-section-a','stage':'initial-support','displacementReference':'since-excavation'}
FIXTURE=Path(__file__).resolve().parents[2]/'tests/fixtures/d2-catalog.json'

class DeformationTests(unittest.TestCase):
    def setUp(self):
        self.catalog=Catalog.model_validate_json(FIXTURE.read_text())
        self.repo=FrozenCatalogRepository(self.catalog)
        self.provider=SyntheticProvider()
        self.algorithm=ConfigurableAlgorithm(self.repo,self.provider,True)
        self.context=EvaluationContext.model_validate(CONTEXT)
    def request(self,**changes):
        request={'params':PARAMS.copy(),'methodKey':'bench','manualReason':'测试缺项时的人工确认','evaluationContext':CONTEXT,'workface':'test_face_a','mileage':'K3601+200'}
        request.update(changes)
        from app.models import DesignRequest
        support=self.algorithm.design(DesignRequest.model_validate(request))
        return RecheckRequest.model_validate({**request,'support':[item.model_dump(by_alias=True) for item in support]})
    def test_24_independently_expected_sensitivity_cases_use_current_complete_configuration(self):
        cases=json.loads((FIXTURE.parent/'d2-response-cases.json').read_text())
        self.assertEqual(len(cases),24)
        request=self.request()
        for case in cases:
            with self.subTest(case=case):
                current=request.model_copy(deep=True)
                next(item for item in current.support if item.key==case['key']).val_num=case['value']
                result=self.algorithm.assess(current)
                self.assertAlmostEqual(result.items[0].value,case['settlement'],places=6)
                self.assertAlmostEqual(result.items[1].value,case['convergence'],places=6)
                self.assertEqual(result.is_test,True)
                self.assertIsNone(result.score);self.assertIsNone(result.radar)
    def test_upper_equality_failure_and_replay_digest(self):
        request=self.request();request.support[0].val_num=160
        result=self.algorithm.assess(request)
        self.assertEqual(result.items[0].value,10)
        self.assertEqual(result.status,'satisfied')
        request.support[0].val_num=240
        failed=self.algorithm.assess(request)
        self.assertEqual(failed.items[0].value,12)
        self.assertEqual(failed.status,'unsatisfied')
        self.assertNotEqual(failed.response.input_digest,result.response.input_digest)
    def test_missing_and_out_of_range_context_material_and_partial_output(self):
        for change in [{'params':{'grade':'IV','section':'主洞标准断面'}},
                       {'params':{**PARAMS,'depth':1300}},
                       {'evaluationContext':{**CONTEXT,'stage':'after-excavation'}},
                       {'evaluationContext':{**CONTEXT,'displacementReference':'total'}},
                       {'evaluationContext':None}]:
            result=self.algorithm.assess(self.request(**change))
            self.assertEqual(result.response.status,'unavailable');self.assertEqual(result.status,'unavailable')
        result=self.algorithm.assess(self.request(params={**PARAMS,'depth':900}))
        self.assertEqual(result.response.status,'partial')
        self.assertIsNone(result.items[1].value)
        self.assertEqual(result.status,'unavailable')
        request=self.request(params={**PARAMS,'depth':900});request.support[0].val_num=240
        result=self.algorithm.assess(request)
        self.assertEqual(result.status,'unsatisfied');self.assertIsNone(result.items[1].value)
        complete=StructuredSupport.model_validate({item.key:item.parameters for item in self.request().support})
        complete.anchor.diameter_mm=25
        self.assertEqual(self.provider.predict(self.request(),'bench',complete).status,'unavailable')
    def test_criterion_lower_interval_units_conflict_and_empty_required_set(self):
        response=self.algorithm.assess(self.request()).response
        criteria=[c.model_copy(deep=True) for c in self.catalog.criteria if c.enabled]
        criteria[0].operator='>=';criteria[0].lower=8;criteria[0].upper=None
        self.assertEqual(evaluate(response,criteria,PARAMS['section'],True).status,'satisfied')
        criteria[0].operator='range';criteria[0].upper=8
        self.assertEqual(evaluate(response,criteria,PARAMS['section'],True).status,'satisfied')
        criteria[0].lower=8.1;criteria[0].upper=9
        self.assertEqual(evaluate(response,criteria,PARAMS['section'],True).status,'unsatisfied')
        response.metrics[0].unit='cm'
        self.assertEqual(evaluate(response,criteria,PARAMS['section'],True).status,'unavailable')
        response.metrics[0].unit='mm'
        self.assertEqual(evaluate(response,[],PARAMS['section'],True).status,'unavailable')
        for c in criteria: c.required=False
        self.assertEqual(evaluate(response,criteria,PARAMS['section'],True).status,'unavailable')
        criteria.append(criteria[0].model_copy(update={'code':'ambiguous'}))
        self.assertEqual(evaluate(response,criteria,PARAMS['section'],True).items[0].status,'unavailable')
    def test_test_mode_is_explicit_and_formal_mode_never_falls_back(self):
        with self.assertRaises(ValueError): load_provider('app.algorithms.response.test_provider:create_provider',False)
        formal=ConfigurableAlgorithm(self.repo)
        result=formal.assess(self.request())
        self.assertEqual(result.status,'unavailable')
        self.assertEqual(result.response.source,'unavailable')
        self.assertNotEqual(formal.info.version,self.algorithm.info.version)
    def test_timeout_failure_and_wrong_input_output_remain_unavailable(self):
        request=self.request();support=StructuredSupport.model_validate({c.key:c.parameters for c in request.support})
        provider=self.provider
        class Failing:
            info=provider.info
            def predict(self,*args): raise RuntimeError('test error')
        self.assertIn('失败',predict_bounded(Failing(),request,'bench',support,1).reason)
        class Slow:
            info=provider.info
            def predict(self,*args): time.sleep(.05);return provider.predict(*args)
        self.assertIn('超时',predict_bounded(Slow(),request,'bench',support,.01).reason)
        class Stale:
            info=provider.info
            def predict(self,*args): return provider.predict(request.model_copy(update={'workface':'other'}),'bench',support)
        self.assertEqual(predict_bounded(Stale(),request,'bench',support,1).status,'unavailable')
    def test_api_version_and_server_replay_preserve_context_and_complete_evaluation(self):
        config=Settings(response_factory='app.algorithms.response.test_provider:create_provider',allow_test_responses=True)
        with TestClient(create_app(config,repository=self.repo)) as client:
            request=self.request().model_dump(mode='json',by_alias=True)
            initial=client.post('/api/decision/recheck-safety',json=request)
            self.assertEqual(initial.status_code,200)
            data=initial.json();self.assertEqual(data['status'],'satisfied')
            save=save_request();save.update(workface='test_face_a',evaluationContext=CONTEXT,algorithm=data['algorithm'])
            save['revisions'][0]['values']['steel']=160
            save['revisions'].append({**deepcopy(save['revisions'][0]),'values':{'steel':240,'shot':22,'anchor':3,'advance':40}})
            saved=client.post('/api/decision/build-snapshot',json=save)
            self.assertEqual(saved.status_code,200,saved.text)
            snapshot=saved.json()
            self.assertEqual(snapshot['input']['evaluationContext'],CONTEXT)
            self.assertEqual(snapshot['channel'],'real');self.assertTrue(snapshot['isTest']);self.assertEqual(snapshot['source'],'simulation')
            self.assertEqual(snapshot['report']['evaluation']['status'],'unsatisfied')
            self.assertEqual(snapshot['report']['baselineEvaluation']['status'],'satisfied')
            self.assertEqual(snapshot['report']['baselineEvaluation']['items'][0]['value'],8)
            self.assertEqual(snapshot['report']['schemaVersion'],3)
            changed=self.catalog.model_copy(deep=True);changed.criteria[0].upper=7
            with TestClient(create_app(config,repository=FrozenCatalogRepository(changed))) as next_client:
                request['algorithm']=data['algorithm']
                self.assertEqual(next_client.post('/api/decision/recheck-safety',json=request).status_code,409)

if __name__=='__main__': unittest.main()
