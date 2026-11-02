import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import { migrateDatabase, type SqlClient } from '@/storage/database/migrate';
import { getSupabaseClient, getSupabaseServiceRoleKey, hasSupabaseCredentials } from '@/storage/database/supabase-client';
import { catalogImportSchema, observationSchema, ruleSchema, templateSchema, type CatalogImport } from '@/lib/decision-catalog';
import { CONSTRUCTION_METHODS } from '@/data/decision';

export class CatalogStoreError extends Error {
  constructor(message: string, public readonly status = 503) { super(message); }
}
export const isLocalTestCatalog = (): boolean => process.env.DECISION_DATA_SOURCE === 'local-test';
export function localTestPath(): string {
  return path.resolve(process.cwd(), process.env.DECISION_LOCAL_TEST_PATH || '.local/decision-test');
}
const globals = globalThis as typeof globalThis & { decisionTestDatabase?: Promise<PGlite> };
export function sqlClient(db: PGlite): SqlClient {
  return { query: async (sql, values) => {
    if (values) return db.query<Record<string, unknown>>(sql, values);
    const results = await db.exec(sql);
    return { rows: (results.at(-1)?.rows ?? []) as Record<string, unknown>[] };
  } };
}
export async function getLocalTestDatabase(): Promise<PGlite> {
  if (!isLocalTestCatalog()) throw new CatalogStoreError('本地测试数据源未显式启用');
  if (!globals.decisionTestDatabase) {
    globals.decisionTestDatabase = (async () => {
      await mkdir(localTestPath(), { recursive: true });
      const { PGlite } = await import('@electric-sql/pglite');
      const db = new PGlite(localTestPath());
      await migrateDatabase(sqlClient(db));
      return db;
    })().catch((error: unknown) => { globals.decisionTestDatabase = undefined; throw error; });
  }
  return globals.decisionTestDatabase;
}

const ruleRowSchema = z.object({ code: z.string(), version: z.number(), name: z.string(), kind: z.string(), method_key: z.string(),
  priority: z.number(), enabled: z.boolean(), conditions: z.unknown(), reason: z.string(), template_code: z.string().nullable(), template_version: z.number().nullable(), source: z.string(), test_batch_id: z.string().nullable() });
const templateRowSchema = z.object({ code: z.string(), version: z.number(), type: z.string(), enabled: z.boolean(), parameters: z.unknown(), source: z.string(), test_batch_id: z.string().nullable() });
const faceRowSchema = z.object({ id: z.number(), code: z.string(), name: z.string() });
const observationRowSchema = z.object({ id: z.uuid(), workface_id: z.number(), chainage_m: z.union([z.string(),z.number()]), observed_at: z.union([z.string(),z.date()]), source: z.string(), params: z.unknown(), test_batch_id: z.string().nullable() });
function chainage(meters: number): string {
  return `K${Math.floor(meters / 1000)}+${Number((meters % 1000).toFixed(3))}`;
}
export async function readDecisionCatalog() {
  let raw:unknown;
  if (isLocalTestCatalog()) {
    const result=await (await getLocalTestDatabase()).query<{ result:unknown }>('SELECT read_decision_catalog() AS result');
    raw=result.rows[0].result;
  } else {
    if (!hasSupabaseCredentials() || !getSupabaseServiceRoleKey()) throw new CatalogStoreError('决策数据库未配置；本地验证请显式运行 pnpm dev:d1');
    const { data,error }=await getSupabaseClient().rpc('read_decision_catalog');
    if (error) throw new CatalogStoreError('读取一致性资料快照失败，请先执行最新数据库迁移');
    raw=data;
  }
  const rows=z.object({ rules:z.array(z.record(z.string(),z.unknown())),templates:z.array(z.record(z.string(),z.unknown())),
    observations:z.array(z.record(z.string(),z.unknown())),faces:z.array(z.record(z.string(),z.unknown())) }).parse(raw);
  const { rules,templates,observations,faces }=rows;
  const workfaces = faces.map((row) => faceRowSchema.parse(row));
  const rulesData = rules.map((row) => {
    const r = ruleRowSchema.parse(row);
    return ruleSchema.parse({ code:r.code, version:r.version, name:r.name, kind:r.kind, methodKey:r.method_key, priority:r.priority, enabled:r.enabled,
      conditions:r.conditions, reason:r.reason, templateCode:r.template_code, templateVersion:r.template_version, source:r.source, testBatchId:r.test_batch_id });
  });
  const templatesData = templates.filter((row) => row.code !== null).map((row) => {
    const t = templateRowSchema.parse(row);
    return templateSchema.parse({ code:t.code, version:t.version, name:t.type, enabled:t.enabled, parameters:t.parameters, source:t.source, testBatchId:t.test_batch_id });
  });
  const observationData = observations.map((row) => {
    const o = observationRowSchema.parse(row);
    const face = workfaces.find((item) => item.id === o.workface_id);
    if (!face) throw new CatalogStoreError('采集记录引用了不存在的工作面');
    return observationSchema.parse({ id:o.id, workface:face.code, mileage:chainage(Number(o.chainage_m)), observedAt:new Date(o.observed_at).toISOString(), params:o.params, source:o.source, testBatchId:o.test_batch_id });
  });
  return { methods: CONSTRUCTION_METHODS, supportByGrade: {}, rules: rulesData, templates: templatesData, observations: observationData,
    meta: { workfaces:workfaces.map((face) => ({ value:face.code,label:face.name,grade:'IV' as const })),
      mileages:[...new Set(observationData.map((item) => item.mileage))].sort().map((mile) => ({ value:mile,label:mile,mile })) },
    dataSource:isLocalTestCatalog() ? 'local-test' : 'database' };
}
export async function catalogRpc(name: 'publish_decision_catalog' | 'set_decision_catalog_enabled', args: Record<string, unknown>): Promise<unknown> {
  try {
    if (isLocalTestCatalog()) {
      const db = await getLocalTestDatabase();
      const result = name === 'publish_decision_catalog'
        ? await db.query('SELECT public.publish_decision_catalog($1::jsonb) AS result', [JSON.stringify(args.p_bundle)])
        : await db.query('SELECT public.set_decision_catalog_enabled($1,$2,$3,$4) AS result', [args.p_kind,args.p_code,args.p_version,args.p_enabled]);
      return result.rows[0];
    }
    if (!hasSupabaseCredentials() || !getSupabaseServiceRoleKey()) throw new CatalogStoreError('数据库未配置，资料未保存');
    const { data, error } = await getSupabaseClient().rpc(name, args);
    if (error) throw error;
    return data;
  } catch (error: unknown) {
    if (error instanceof CatalogStoreError) throw error;
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === '23505') throw new CatalogStoreError('同一编码和版本已有不同内容；请创建新版本，原资料未覆盖',409);
    if (code === '23503') throw new CatalogStoreError('引用的工法或支护模板不存在，整批资料未保存',400);
    if (code === 'P0002') throw new CatalogStoreError('工作面或指定版本不存在',404);
    throw new CatalogStoreError('资料保存失败，整批操作已回滚；请检查数据库迁移和资料引用',400);
  }
}
export function publishDecisionCatalog(input: CatalogImport): Promise<unknown> {
  return catalogRpc('publish_decision_catalog', { p_bundle: catalogImportSchema.parse(input) });
}
