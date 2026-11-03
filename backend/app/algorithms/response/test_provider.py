"""Explicit synthetic arithmetic. Not a geotechnical prediction method."""
from hashlib import sha256
import json
from pathlib import Path
from decimal import Decimal
from app.models import geo_values, InferRequest, StructuredSupport
from app.response_models import ProviderInfo, ResponseResult, ResponseMetric
from .base import input_digest, unavailable

class SyntheticProvider:
    def __init__(self) -> None:
        raw=Path(__file__).with_name('synthetic-manifest.json').read_bytes()
        self.manifest=json.loads(raw)
        self._info=ProviderInfo(id=self.manifest['id'],version=self.manifest['version']+'+'+sha256(raw).hexdigest()[:16],
            is_test=True,test_batch_id=self.manifest['testBatchId'],description=self.manifest['description'])
    @property
    def info(self) -> ProviderInfo: return self._info.model_copy(deep=True)
    def predict(self,request:InferRequest,method_key:str,support:StructuredSupport) -> ResponseResult:
        p=geo_values(request.params);m=self.manifest
        missing=[key for key in m['requiredParams'] if key not in p]
        reject=lambda reason: unavailable(self.info,request,method_key,support,reason)
        if missing: return reject('测试模型缺少输入：'+', '.join(missing))
        if not request.evaluation_context: return reject('缺少评价断面、阶段或位移基准')
        context=request.evaluation_context
        if context.stage!='initial-support' or context.displacement_reference!='since-excavation':
            return reject('测试模型未覆盖该阶段或位移基准')
        if p['grade']!='IV' or p['section']!='主洞标准断面' or method_key!='bench':
            return reject('测试模型仅覆盖 IV 级、主洞标准断面与台阶法，不外推')
        # Every non-editable material/geometry field is checked, not inferred from a label.
        expected=StructuredSupport.model_validate({
            'steel':{'model':'TEST-I16','spacingCm':80},'shot':{'strength':'TEST-C25','thicknessCm':22},
            'anchor':{'type':'测试系统锚杆','diameterMm':22,'lengthM':3,'longitudinalSpacingCm':120,'circumferentialSpacingCm':80},
            'advance':{'type':'测试超前锚杆','diameterMm':22,'lengthM':4.5,'ringSpacingCm':40,'scope':'测试拱部布置范围'}})
        expected.steel.spacing_cm=support.steel.spacing_cm;expected.shot.thickness_cm=support.shot.thickness_cm
        expected.anchor.length_m=support.anchor.length_m;expected.advance.ring_spacing_cm=support.advance.ring_spacing_cm
        if expected != support: return reject('当前材料或完整规格未被测试模型覆盖')
        values={'steel':support.steel.spacing_cm,'shot':support.shot.thickness_cm,'anchor':support.anchor.length_m,'advance':support.advance.ring_spacing_cm}
        for fields,ranges in [(p,m['geoRanges']),(values,m['supportRanges'])]:
            for key,(low,high) in ranges.items():
                if not low <= fields[key] <= high: return reject(f'{key} 超出测试模型适用范围 [{low}, {high}]')
        d=lambda value: Decimal(str(value))
        g=sum(d(m['baseGeo'][key])/d(p[key]) if key=='elastic' else d(p[key])/d(m['baseGeo'][key]) for key in m['baseGeo'])/4
        s=sum(d(m['baseValues'][key])/d(values[key]) if key in ('shot','anchor') else d(values[key])/d(m['baseValues'][key]) for key in values)/4
        metrics=[]
        for key,base in m['baseMetrics'].items():
            partial=key=='convergence' and p['depth']==m['partialDepthM']
            metrics.append(ResponseMetric(key=key,value=None if partial else float(round(d(base)*g*s,6)),
                reason='此合成场景未提供收敛输出' if partial else '合成敏感性算术输出，非工程预测'))
        return ResponseResult(status='partial' if any(item.value is None for item in metrics) else 'available',provider=self.info,
            context=context,input_digest=input_digest(request,method_key,support),source='simulation',metrics=metrics,
            reason=m['description'])

def create_provider() -> SyntheticProvider: return SyntheticProvider()
