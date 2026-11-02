import { getLocalTestDatabase,isLocalTestCatalog } from './catalog-store';
import { schemeHistoryData } from "@/data/scheme";
import { advanceToMeters, durationToMinutes } from "@/lib/measurements";
import type { HistoryRecord, SchemeHistoryData, SchemeReport } from "@/lib/types";
import { getSupabaseClient, hasSupabaseCredentials } from "@/storage/database/supabase-client";

/**
 * 后端服务层 —— 方案报告与历史决策台账业务逻辑（Supabase 持久化）。
 *
 * - 读取：scheme_history 表；种子数据通过 pnpm db:seed 显式导入
 * - 写入：新增 / 批量导入 均落库，刷新不丢失
 */

interface SchemeHistoryRow {
  id: number;
  time: string;
  face: string;
  start_mile: string;
  end_mile: string;
  rock: string;
  method: string;
  type: string;
  score: string | number | null;
  evaluation_status?: string | null;
  advance: string;
  detail: string;
  custom: boolean;
  source?: string;
  scheme_report_id?: string | null;
  decision_run_id?: string | null;
}

function toRecord(row: SchemeHistoryRow): HistoryRecord {
  const record: HistoryRecord = {
    id: row.id,
    time: row.time,
    face: row.face,
    startMile: row.start_mile,
    endMile: row.end_mile,
    rock: row.rock,
    method: row.method,
    type: row.type,
    score: row.score === null ? null : Number(row.score),
    evaluationStatus:row.evaluation_status,
    advance: row.advance,
    detail: row.detail,
    source: row.source,
    schemeReportId: row.scheme_report_id ?? undefined,
    decisionRunId: row.decision_run_id ?? undefined,
  };
  // 用户新增行 custom=true
  if (row.custom) record.custom = true;
  return record;
}

/** 查询台账列表，读取无副作用 */
export async function listSchemeHistory(): Promise<SchemeHistoryData> {
  if (isLocalTestCatalog()) {
    const result=await (await getLocalTestDatabase()).query<SchemeHistoryRow & Record<string,unknown>>('SELECT * FROM scheme_history ORDER BY time,id');
    const records=result.rows.map(toRecord);
    return { ...schemeHistoryData,records,faces:['全部工作面',...new Set(records.map((item) => item.face))] };
  }
  // 未配置数据库时提供内置台账供本地浏览；写操作仍需数据库。
  if (!hasSupabaseCredentials()) return {
    ...structuredClone(schemeHistoryData),
    records: schemeHistoryData.records.map((row) => ({ ...row, source: 'seed' })),
  };

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("scheme_history")
    .select("*")
    .order("time", { ascending: true });
  if (error) throw error;
  const records = (data ?? []).map((r) => toRecord(r as SchemeHistoryRow));
  const faces = ["全部工作面", ...new Set(records.map((record) => record.face))];
  return { ...schemeHistoryData, faces, records };
}

/** 新增单条决策记录，落库返回完整记录 */
export async function createSchemeHistory(
  input: Omit<HistoryRecord, "id" | "custom">
): Promise<HistoryRecord> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("scheme_history")
    .insert({
      source: "manual",
      advance_m: advanceToMeters(input.advance),
      cycle_duration_minutes: durationToMinutes(input.detail),
      time: input.time,
      face: input.face,
      start_mile: input.startMile,
      end_mile: input.endMile,
      rock: input.rock,
      method: input.method,
      type: input.type,
      score: String(input.score),
      advance: input.advance,
      detail: input.detail,
      custom: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toRecord(data as SchemeHistoryRow);
}

/** 批量导入决策记录，返回入库条数 */
export async function importSchemeHistory(
  list: Array<Omit<HistoryRecord, "id" | "custom">>
): Promise<number> {
  const client = getSupabaseClient();
  const rows = list.map((r) => ({
    source: "import",
    advance_m: advanceToMeters(r.advance),
    cycle_duration_minutes: durationToMinutes(r.detail),
    time: r.time,
    face: r.face,
    start_mile: r.startMile,
    end_mile: r.endMile,
    rock: r.rock,
    method: r.method,
    type: r.type,
    score: String(r.score),
    advance: r.advance,
    detail: r.detail,
    custom: true,
  }));
  if (rows.length === 0) return 0;
  const { error } = await client.from("scheme_history").insert(rows);
  if (error) throw error;
  return rows.length;
}

/** 删除单条决策记录 */
export async function deleteSchemeHistory(id: number): Promise<void> {
  await deleteHistoryIds([id]);
}

async function deleteHistoryIds(ids: number[]): Promise<number> {
  if (isLocalTestCatalog()) {
    const result=await (await getLocalTestDatabase()).query<{ count:number }>('SELECT delete_scheme_history($1::integer[]) AS count',[ids]);
    return result.rows[0].count;
  }
  const client = getSupabaseClient();
  const { data,error } = await client.rpc('delete_scheme_history',{ p_ids:ids });
  if (error) throw error;
  return Number(data);
}

export async function clearLocalTestHistory(): Promise<number> {
  if (!isLocalTestCatalog()) throw new Error('清空测试记录仅在 dev:d1 本地测试模式可用');
  const db=await getLocalTestDatabase();
  const result=await db.query<{ id:number }>('SELECT id FROM scheme_history');
  return deleteHistoryIds(result.rows.map((row) => row.id));
}

export async function getSchemeReport(id: string): Promise<SchemeReport | null> {
  if (isLocalTestCatalog()) {
    const result=await (await getLocalTestDatabase()).query<{ content:SchemeReport }>('SELECT content FROM scheme_report WHERE id=$1',[id]);
    return result.rows[0]?.content ?? null;
  }
  const client = getSupabaseClient();
  const { data, error } = await client.from('scheme_report').select('content').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? data.content as SchemeReport : null;
}
