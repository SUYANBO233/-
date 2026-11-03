import { decisionMetaSchema, inferMethodsResultSchema, supportDesignResultSchema, safetySchema, schemeReportSchema, synchronizeSchema, supportOptionsSchema, parseDecisionResponse } from './validation/decision-response';
import type {
  DecisionMeta,
  EquipmentItem,
  GeoParams,
  HistoryRecord,
  KnowledgeData,
  KnowledgeMapping,
  OverviewData,
  SafetyAssessment,
  SchemeHistoryData,
  SchemeReport,
  SupportComponent,
  SupportScheme,
  SaveDecisionRequest,
  SaveDecisionResult,
  InferMethodsResult,
  SupportDesignResult,
} from './types';

/**
 * 构造请求基址：
 * - 客户端（浏览器）：同源相对路径即可；
 * - 服务端（Next.js Server Component/Route）：必须使用绝对地址，
 *   否则 Node 环境以相对路径发起 fetch 会抛出 ERR_INVALID_URL。
 */
function apiBase(): string {
  if (typeof window !== 'undefined') return '';
  const port = process.env.DEPLOY_RUN_PORT || process.env.PORT || '5000';
  return `http://localhost:${port}`;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBase()}${path}`, init);
}

/**
 * 数据访问层 —— 预留与后端交互的统一接口。
 *
 * 前端组件应统一调用本模块暴露的函数获取数据，
 * 而不是直接 import 静态数据，从而把「数据来源」与「视图渲染」解耦。
 *
 * 数据来源说明：
 * - 总览数据：当前版本直接返回本地静态数据（src/data/overview.ts）。
 * - 决策中心：推理/校核/出方案等核心计算逻辑将由后端（Python 服务）承担。
 *   下方决策相关函数已定义统一请求契约，后端就绪后启用 fetch 实现即可，
 *   前端组件与类型契约保持不变。
 *   前端通过同一路径前缀 `/api/decision/*` 访问，由部署层将其转发到
 *   Python 后端服务，实现前后端解耦、同源访问。
 */
export async function fetchOverview(): Promise<OverviewData> {
  const res = await apiFetch('/api/overview', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`加载总览数据失败：${res.status}`);
  }
  return (await res.json()) as OverviewData;
}

/**
 * 获取经验数据库数据（装备 / 工法 / 知识映射 / 支护方案）。
 * 数据源：Supabase 持久化（通过独立初始化脚本导入种子数据）；
 * 未配置 Supabase 时，服务层返回内置种子数据供本地浏览。
 */
export async function fetchKnowledge(): Promise<KnowledgeData> {
  const res = await apiFetch('/api/knowledge', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`加载经验数据库失败：${res.status}`);
  }
  return (await res.json()) as KnowledgeData;
}

/**
 * 获取方案报告与历史决策台账数据。
 * 数据源：Supabase 持久化（通过独立初始化脚本导入种子数据）。
 * 未配置 Supabase 时，服务层返回内置台账供本地浏览。
 */
export async function fetchSchemeHistory(): Promise<SchemeHistoryData> {
  const res = await apiFetch('/api/scheme', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`加载历史台账失败：${res.status}`);
  }
  return (await res.json()) as SchemeHistoryData;
}

export async function fetchSchemeReport(id: string): Promise<SchemeReport> {
  const response = await apiFetch(`/api/scheme/reports/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('报告读取失败，请稍后重试');
  return await response.json() as SchemeReport;
}

/* ============================================================
   通用写接口封装
   ============================================================ */

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `请求失败：${res.status}`);
  }
  return (await res.json()) as T;
}

async function delJSON(url: string): Promise<void> {
  const res = await apiFetch(url, { method: 'DELETE', cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `删除失败：${res.status}`);
  }
}

/* ---- 方案台账 ---- */

/** 新增单条决策记录，返回落库后的完整记录 */
export async function createSchemeHistory(
  input: Omit<HistoryRecord, 'id' | 'custom'>
): Promise<HistoryRecord> {
  const res = await postJSON<{ record: HistoryRecord }>('/api/scheme', input);
  return res.record;
}

/** 批量导入决策记录，返回入库数量 */
export async function importSchemeHistory(
  list: Array<Omit<HistoryRecord, 'id' | 'custom'>>
): Promise<number> {
  const res = await postJSON<{ count: number }>('/api/scheme/import', list);
  return res.count;
}

/** 删除台账记录（按 DB id） */
export async function deleteSchemeHistory(id: number): Promise<void> {
  await delJSON(`/api/scheme?id=${id}`);
}

export async function clearLocalTestHistory(confirmation:string):Promise<number> {
  const response=await fetch('/api/scheme?scope=local-test',{
    method:'DELETE',headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ confirmation }),
  });
  const data:unknown=await response.json();
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' ? data.message : '清空失败');
  if (!data || typeof data !== 'object' || !('count' in data) || typeof data.count !== 'number') throw new Error('清空接口响应无效');
  return data.count;
}

/* ---- 经验数据库：装备 ---- */

export async function createEquipment(
  input: Omit<EquipmentItem, 'id' | 'custom'>
): Promise<EquipmentItem> {
  const res = await postJSON<{ item: EquipmentItem }>('/api/knowledge/equipment', input);
  return res.item;
}

export async function importEquipment(
  list: Array<Omit<EquipmentItem, 'id' | 'custom'>>
): Promise<number> {
  const res = await postJSON<{ count: number }>('/api/knowledge/equipment/import', list);
  return res.count;
}

export async function deleteEquipment(id: number): Promise<void> {
  await delJSON(`/api/knowledge/equipment?id=${id}`);
}

/* ---- 经验数据库：知识映射 ---- */

export async function createMapping(
  input: Omit<KnowledgeMapping, 'no' | 'custom'>
): Promise<KnowledgeMapping> {
  const res = await postJSON<{ item: KnowledgeMapping }>('/api/knowledge/mappings', input);
  return res.item;
}

export async function importMappings(
  list: Array<Omit<KnowledgeMapping, 'no' | 'custom'>>
): Promise<number> {
  const res = await postJSON<{ count: number }>('/api/knowledge/mappings/import', list);
  return res.count;
}

export async function deleteMapping(id: number): Promise<void> {
  await delJSON(`/api/knowledge/mappings?id=${id}`);
}

/* ---- 经验数据库：支护方案 ---- */

export async function createSupportScheme(
  input: Omit<SupportScheme, 'no' | 'custom'>
): Promise<SupportScheme> {
  const res = await postJSON<{ item: SupportScheme }>('/api/knowledge/schemes', input);
  return res.item;
}

export async function importSupportSchemes(
  list: Array<Omit<SupportScheme, 'no' | 'custom'>>
): Promise<number> {
  const res = await postJSON<{ count: number }>('/api/knowledge/schemes/import', list);
  return res.count;
}

export async function deleteSupportScheme(id: number): Promise<void> {
  await delJSON(`/api/knowledge/schemes?id=${id}`);
}

/* ============================================================
   Python 决策服务：浏览器始终访问同源 /api/decision/*，由 Next.js 转发。
   方案入库属于本地业务 API /api/scheme/*。
   ============================================================ */

const DECISION_API_BASE = '/api/decision';

export async function saveDecisionScheme(input: SaveDecisionRequest): Promise<SaveDecisionResult> {
  return postJSON<SaveDecisionResult>('/api/scheme/save-decision', input);
}

export async function fetchDecisionMeta(): Promise<DecisionMeta> {
  const response = await apiFetch(`${DECISION_API_BASE}/meta`, { cache: 'no-store' });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message : '无法读取决策元数据';
    throw new Error(message);
  }
  return parseDecisionResponse(decisionMetaSchema, await response.json());
}

export interface InferMethodsRequest {
  evaluationContext?: import('./response').EvaluationContext | null;
  params: Partial<GeoParams>;
  algorithm?: import('./types').AlgorithmInfo;
  observationId?: string | null;
  manualReason?: string;
  template?: import('./types').TemplateReference | null;
  workface?: string;
  mileage?: string;
}

function decisionRequest(request: InferMethodsRequest) {
  const { params,workface,mileage,algorithm,observationId,manualReason,template,evaluationContext }=request;
  return { params,workface,mileage,algorithm,observationId,manualReason,template,evaluationContext };
}

export async function inferMethods(request: InferMethodsRequest): Promise<InferMethodsResult> {
  return parseDecisionResponse(inferMethodsResultSchema, await postJSON<unknown>(`${DECISION_API_BASE}/infer-methods`, decisionRequest(request)));
}

export async function designSupport(request: InferMethodsRequest & { methodKey: string }): Promise<SupportDesignResult> {
  return parseDecisionResponse(supportDesignResultSchema, await postJSON<unknown>(`${DECISION_API_BASE}/design-support`, { ...decisionRequest(request),methodKey:request.methodKey }));
}

export interface RecheckRequest extends InferMethodsRequest {
  params: Partial<GeoParams>;
  methodKey: string;
  support: SupportComponent[];
  workface?: string;
  mileage?: string;
}

export async function recheckSafety(request: RecheckRequest): Promise<SafetyAssessment> {
  return parseDecisionResponse(safetySchema, await postJSON<unknown>(`${DECISION_API_BASE}/recheck-safety`, { ...decisionRequest(request),methodKey:request.methodKey,support:request.support }));
}

export interface GenerateSchemeRequest extends RecheckRequest { mileage: string }

export async function generateSchemeApi(request: GenerateSchemeRequest): Promise<SchemeReport> {
  return parseDecisionResponse(schemeReportSchema, await postJSON<unknown>(`${DECISION_API_BASE}/generate-scheme`, { ...decisionRequest(request),methodKey:request.methodKey,support:request.support }));
}

export async function synchronizeDecision(workface: string,mileage: string) {
  return parseDecisionResponse(synchronizeSchema,await postJSON<unknown>(`${DECISION_API_BASE}/synchronize`,{workface,mileage}));
}
export async function fetchSupportOptions(request: InferMethodsRequest & { methodKey: string }) {
  return parseDecisionResponse(supportOptionsSchema,await postJSON<unknown>(`${DECISION_API_BASE}/support-options`,{ ...decisionRequest(request),methodKey:request.methodKey }));
}
