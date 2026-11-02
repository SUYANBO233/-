import type { SaveDecisionRequest, SaveDecisionResult } from '@/lib/types';
import { buildDecisionPayload } from '@/server/decision-payload';
import { DecisionBackendError } from '@/server/decision-backend';
import { getSupabaseClient, getSupabaseServiceRoleKey, hasSupabaseCredentials } from '@/storage/database/supabase-client';

export class DecisionSaveError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** 由配置的 Python 算法生成可信快照，再调用已有数据库事务。 */
export async function saveDecision(input: SaveDecisionRequest): Promise<SaveDecisionResult> {
  if (!hasSupabaseCredentials() || !getSupabaseServiceRoleKey()) {
    throw new DecisionSaveError('数据库尚未配置，方案未保存。请配置数据库并执行迁移和初始化。', 503);
  }
  const client = getSupabaseClient();
  const face = await client.from('workface').select('id').eq('code', input.workface).maybeSingle();
  if (face.error) throw new DecisionSaveError('工作面数据读取失败，请确认数据库迁移和初始化已完成。', 503);
  if (!face.data) throw new DecisionSaveError('工作面不存在，请先初始化工程数据。', 400);

  // 报告编号/时间由数据库分配；请求体保持确定性，网络重试命中同一请求键。
  const payload = await buildDecisionPayload(input).catch((error: unknown) => {
    if (error instanceof DecisionBackendError) throw new DecisionSaveError(error.message, error.status);
    throw error;
  });
  const { error, data } = await client.rpc('save_decision', { p_payload: payload });
  if (error) {
    if (error.code === '23505') throw new DecisionSaveError('此保存请求已用于其他内容，请重新生成方案。', 409);
    console.error('保存决策事务失败', error.code, error.message);
    throw new DecisionSaveError('方案保存失败，请检查数据库迁移和初始化是否完成后重试。', 503);
  }
  return data as SaveDecisionResult;
}
