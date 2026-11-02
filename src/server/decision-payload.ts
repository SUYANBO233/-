import { decisionPayloadSchema, parseDecisionResponse } from '@/lib/validation/decision-response';
import type { SaveDecisionRequest } from '@/lib/types';
import { decisionBackendJson, DecisionBackendError } from '@/server/decision-backend';

/** The same configured Python algorithm replays revisions; database code contains no algorithm. */
export async function buildDecisionPayload(input: SaveDecisionRequest) {
  const data = await decisionBackendJson('build-snapshot', input);
  const payload = parseDecisionResponse(decisionPayloadSchema, data);
  if (payload.requestKey !== input.requestKey || payload.workface !== input.workface || payload.mode !== input.mode
    || payload.input.workface !== input.workface || payload.input.mileage !== input.mileage || payload.report.mile !== input.mileage
    || Object.entries(input.params).some(([key, value]) => payload.input.params[key] !== value)
    || payload.revisions.length !== input.revisions.length
    || payload.revisions.some((item, index) => item.methodKey !== input.revisions[index].methodKey
      || item.support.some((component) => component.valNum !== input.revisions[index].values[component.key]))) {
    throw new DecisionBackendError('算法保存快照与当前输入不一致，方案未保存', 502);
  }
  const algorithm = payload.report.algorithm;
  if (payload.algorithmVersion !== `${algorithm.id}:${algorithm.version}`
    || payload.source !== (algorithm.reference ? 'simulation' : 'algorithm')
    || payload.channel !== (algorithm.reference ? 'mock' : 'real')) {
    throw new DecisionBackendError('算法快照来源标记不一致，方案未保存', 502);
  }
  return payload;
}
