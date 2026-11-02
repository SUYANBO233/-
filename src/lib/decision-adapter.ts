'use client';

/** Transport can be replaced without changing view components. Backend is the default. */
import { assessSafety, designSupport, getArchMechanism, inferMethods, generateScheme } from './decision-engine';
import {
  designSupport as apiDesignSupport, inferMethods as apiInferMethods,
  recheckSafety as apiRecheckSafety, generateSchemeApi, fetchDecisionMeta,
  type InferMethodsRequest, type RecheckRequest, type GenerateSchemeRequest,
} from './api';
import type { AlgorithmInfo, DecisionMeta, InferMethodsResult, SupportDesignResult } from './types';

export type DecisionChannel = 'mock' | 'backend';
export const DECISION_CHANNEL: DecisionChannel = process.env.NEXT_PUBLIC_DECISION_CHANNEL === 'mock' ? 'mock' : 'backend';
export const MOCK_ALGORITHM: AlgorithmInfo = { id: 'browser-demo', version: '1.0.0', reference: true,
  description: '显式启用的浏览器演示通道；结果未经工程标定' };

export const INFER_LOGS = [
  '读取当前工作面与地质参数…',
  '向决策服务提交工法推荐请求…',
  '匹配候选工法并校验返回结果…',
  '输出推荐工法与算法版本…',
];
export const DESIGN_LOGS = [
  '向决策服务提交支护设计请求…',
  '计算四类支护构件配置…',
  '取得评估结果与成拱参数…',
  '生成可追溯的支护参数方案…',
];

export async function loadDecisionMeta(): Promise<DecisionMeta> {
  if (DECISION_CHANNEL === 'backend') return fetchDecisionMeta();
  const { DECISION_META } = await import('@/data/decision');
  return { ...DECISION_META, algorithm: MOCK_ALGORITHM };
}

export async function inferMethodCandidates(request: InferMethodsRequest): Promise<InferMethodsResult> {
  if (DECISION_CHANNEL === 'backend') return apiInferMethods(request);
  return { methods: inferMethods(request.params), algorithm: MOCK_ALGORITHM };
}

export async function designSupportCandidates(request: InferMethodsRequest & { methodKey: string }): Promise<SupportDesignResult> {
  if (DECISION_CHANNEL === 'backend') return apiDesignSupport(request);
  const support = designSupport(request.params, request.methodKey);
  return { support, safety: { ...assessSafety(request.params, support), algorithm: MOCK_ALGORITHM },
    mechanism: getArchMechanism(request.params.grade), algorithm: MOCK_ALGORITHM };
}

export async function recheckSupport(request: RecheckRequest) {
  if (DECISION_CHANNEL === 'backend') return apiRecheckSafety(request);
  return { ...assessSafety(request.params, request.support), algorithm: MOCK_ALGORITHM };
}

export async function buildSchemeReport(request: GenerateSchemeRequest) {
  if (DECISION_CHANNEL === 'backend') return generateSchemeApi(request);
  return { ...generateScheme(request.params, request.mileage, request.methodKey, request.support), algorithm: MOCK_ALGORITHM };
}
