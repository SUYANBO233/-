"""Replace only this provider to integrate a real model; no automatic fallback."""
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from hashlib import sha256
from importlib import import_module
import json
from threading import BoundedSemaphore
from typing import Protocol, runtime_checkable
from app.models import StructuredSupport, InferRequest, geo_values
from app.response_models import ProviderInfo, ResponseResult, ResponseMetric

@runtime_checkable
class ResponseProvider(Protocol):
    @property
    def info(self) -> ProviderInfo: ...
    def predict(self, request: InferRequest, method_key: str, support: StructuredSupport) -> ResponseResult: ...


def input_digest(request: InferRequest, method_key: str, support: StructuredSupport) -> str:
    body={'params':geo_values(request.params),'methodKey':method_key,'support':support.model_dump(mode='json',by_alias=True),
          'workface':request.workface,'mileage':request.mileage,
          'context':request.evaluation_context.model_dump(mode='json',by_alias=True) if request.evaluation_context else None}
    return sha256(json.dumps(body,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def unavailable(provider:ProviderInfo,request:InferRequest,method_key:str,support:StructuredSupport,reason:str) -> ResponseResult:
    return ResponseResult(status='unavailable',provider=provider,context=request.evaluation_context,
        input_digest=input_digest(request,method_key,support),source='unavailable',reason=reason,
        metrics=[ResponseMetric(key=key,reason=reason) for key in ('settlement','convergence')])

class UnavailableProvider:
    @property
    def info(self) -> ProviderInfo:
        return ProviderInfo(id='not-connected',version='1',is_test=False,description='响应模型未接入')
    def predict(self,request:InferRequest,method_key:str,support:StructuredSupport) -> ResponseResult:
        return unavailable(self.info,request,method_key,support,'响应模型未接入；未自动启用测试预测')

def create_unavailable() -> UnavailableProvider:
    return UnavailableProvider()

def load_provider(factory_path:str,allow_test:bool) -> ResponseProvider:
    module,sep,name=factory_path.partition(':')
    if not sep: raise ValueError('DECISION_RESPONSE_FACTORY must use module:factory')
    provider=getattr(import_module(module),name)()
    if not isinstance(provider,ResponseProvider): raise TypeError('invalid response provider protocol')
    ProviderInfo.model_validate(provider.info.model_dump())
    if provider.info.is_test and not allow_test:
        raise ValueError('测试响应提供器仅能在显式隔离 local-test 配置下启用')
    return provider

_pool=ThreadPoolExecutor(max_workers=4,thread_name_prefix='response-provider')
_slots=BoundedSemaphore(4)

def predict_bounded(provider:ResponseProvider,request:InferRequest,method_key:str,support:StructuredSupport,timeout:float) -> ResponseResult:
    if not _slots.acquire(blocking=False):
        return unavailable(provider.info,request,method_key,support,'响应服务繁忙，请重试')
    future=_pool.submit(provider.predict,request.model_copy(deep=True),method_key,support.model_copy(deep=True))
    future.add_done_callback(lambda _: _slots.release())
    try:
        result=ResponseResult.model_validate(future.result(timeout=timeout).model_dump())
        if result.provider != provider.info or result.context != request.evaluation_context or result.input_digest != input_digest(request,method_key,support):
            raise ValueError('response provenance mismatch')
        keys=[item.key for item in result.metrics]
        if len(keys)!=len(set(keys)) or (result.source!='unavailable' and (result.source=='simulation') != result.provider.is_test):
            raise ValueError('response metric/source mismatch')
        if result.status=='available' and any(item.value is None for item in result.metrics):
            raise ValueError('available response with missing metric')
        return result
    except FutureTimeout:
        future.cancel()
        return unavailable(provider.info,request,method_key,support,'响应模型调用超时；未使用旧结果或测试回退')
    except Exception:
        return unavailable(provider.info,request,method_key,support,'响应模型调用失败或结果契约不正确；请检查模型服务')
