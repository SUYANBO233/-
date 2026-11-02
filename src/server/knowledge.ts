import { knowledgeData } from "@/data/knowledge";
import { supportParameters } from "@/lib/measurements";
import type {
  EquipmentItem,
  KnowledgeData,
  KnowledgeMapping,
  SupportScheme,
} from "@/lib/types";
import { getSupabaseClient, hasSupabaseCredentials } from "@/storage/database/supabase-client";

/**
 * 后端服务层 —— 经验数据库业务逻辑（Supabase 持久化）。
 * - 装备 / 知识映射 / 支护方案 / 标准工法均从数据库读取
 * - 数据初始化由 pnpm db:seed 显式执行，读取不再触发写入
 * - 写操作：新增 / 批量导入 / 删除
 */

/* ---------------- 行 -> 领域类型 ---------------- */

interface EqRow {
  id: number;
  name: string;
  model: string;
  num: number;
  unit: string;
  pos: string;
  stage: string;
  is_custom: boolean;
}
function toEquip(r: EqRow): EquipmentItem {
  const item: EquipmentItem = {
    id: r.id,
    name: r.name,
    model: r.model,
    num: r.num,
    unit: r.unit,
    pos: r.pos,
    stage: r.stage,
  };
  if (r.is_custom) item.custom = true;
  return item;
}

interface MapRow {
  id: number;
  no: number;
  code: string;
  hard: string;
  intact: string;
  water: string;
  depth: string;
  stress: string;
  rock: string;
  scheme: string;
  is_custom: boolean;
}
function toMapping(r: MapRow): KnowledgeMapping {
  const m: KnowledgeMapping = {
    id: r.id,
    no: r.no,
    code: r.code,
    hard: r.hard,
    intact: r.intact,
    water: r.water,
    depth: r.depth,
    stress: r.stress,
    rock: r.rock,
    scheme: r.scheme,
  };
  if (r.is_custom) m.custom = true;
  return m;
}

interface SchemeRow {
  id: number;
  no: number;
  rock: string;
  type: string;
  depth: string;
  adv_type: string;
  adv_ring: string;
  adv_len: string;
  adv_scope: string;
  anchor: string;
  steel: string;
  shot: string;
  conc: string;
  thick: string;
  mode: string;
  adv_rate: string;
  bench_len: string;
  is_custom: boolean;
}
function toScheme(r: SchemeRow): SupportScheme {
  const s: SupportScheme = {
    id: r.id,
    no: r.no,
    rock: r.rock,
    type: r.type,
    depth: r.depth,
    advType: r.adv_type,
    advRing: r.adv_ring,
    advLen: r.adv_len,
    advScope: r.adv_scope,
    anchor: r.anchor,
    steel: r.steel,
    shot: r.shot,
    conc: r.conc,
    thick: r.thick,
    mode: r.mode,
    advRate: r.adv_rate,
    benchLen: r.bench_len,
  };
  if (r.is_custom) s.custom = true;
  return s;
}

/** 支护方案：camelCase 领域对象 → snake_case 数据库行 */
function toDbScheme(r: Omit<SupportScheme, "custom" | "no"> & { is_custom: boolean }) {
  return {
    rock: r.rock,
    type: r.type,
    depth: r.depth,
    adv_type: r.advType,
    adv_ring: r.advRing,
    adv_len: r.advLen,
    adv_scope: r.advScope,
    anchor: r.anchor,
    steel: r.steel,
    shot: r.shot,
    conc: r.conc,
    thick: r.thick,
    mode: r.mode,
    adv_rate: r.advRate,
    bench_len: r.benchLen,
    is_custom: r.is_custom,
    parameters: supportParameters(r),
  };
}

/** 读取经验数据库全部数据（种子 + 用户新增） */
export async function getKnowledge(): Promise<KnowledgeData> {
  // 本地开发未配置数据库时仍可浏览内置经验库；写操作继续要求数据库配置。
  if (!hasSupabaseCredentials()) return structuredClone(knowledgeData);

  const client = getSupabaseClient();

  const eq = await client
    .from("equipment")
    .select("*")
    .order("id", { ascending: true });
  if (eq.error) throw eq.error;

  const mp = await client
    .from("knowledge_mapping")
    .select("*")
    .order("no", { ascending: true });
  if (mp.error) throw mp.error;

  const sp = await client
    .from("support_scheme")
    .select("*")
    .order("no", { ascending: true });
  if (sp.error) throw sp.error;

  const methods = await client.from("construction_method").select("name,tone,geology,section,advantage,equipment_text").order("id");
  if (methods.error) throw methods.error;

  return {
    ...knowledgeData,
    methods: (methods.data ?? []).map((row) => ({
      name: String(row.name), tone: row.tone === "ok" || row.tone === "warn" ? row.tone : "brand",
      geology: String(row.geology), section: String(row.section), advantage: String(row.advantage), equipment: String(row.equipment_text),
    })),
    equipment: (eq.data ?? []).map((r) => toEquip(r)),
    mappings: (mp.data ?? []).map((r) => toMapping(r)),
    schemes: (sp.data ?? []).map((r) => toScheme(r)),
  };
}

/* ---------------- 装备 ---------------- */

export async function createEquipment(
  input: Omit<EquipmentItem, "id" | "custom">
): Promise<EquipmentItem> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("equipment")
    .insert({
      source: "manual",
      name: input.name,
      model: input.model,
      num: input.num,
      unit: input.unit,
      pos: input.pos,
      stage: input.stage,
      is_custom: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toEquip(data);
}

export async function importEquipment(
  list: Array<Omit<EquipmentItem, "id" | "custom">>
): Promise<number> {
  const client = getSupabaseClient();
  if (list.length === 0) return 0;
  const rows = list.map((r) => ({
    source: "import",
    name: r.name,
    model: r.model,
    num: r.num ?? 1,
    unit: r.unit ?? "台",
    pos: r.pos,
    stage: r.stage,
    is_custom: true,
  }));
  const { error } = await client.from("equipment").insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function deleteEquipment(id: number): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from("equipment").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- 知识映射 ---------------- */

export async function createMapping(
  input: Omit<KnowledgeMapping, "no" | "custom">
): Promise<KnowledgeMapping> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("knowledge_mapping")
    .insert({
      source: "manual",
      code: input.code,
      hard: input.hard,
      intact: input.intact,
      water: input.water,
      depth: input.depth,
      stress: input.stress,
      rock: input.rock,
      scheme: input.scheme,
      is_custom: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toMapping(data);
}

export async function importMappings(
  list: Array<Omit<KnowledgeMapping, "no" | "custom">>
): Promise<number> {
  const client = getSupabaseClient();
  if (list.length === 0) return 0;
  const rows = list.map((r) => ({
    source: "import",
    code: r.code,
    hard: r.hard,
    intact: r.intact,
    water: r.water,
    depth: r.depth,
    stress: r.stress,
    rock: r.rock,
    scheme: r.scheme,
    is_custom: true,
  }));
  const { error } = await client.from("knowledge_mapping").insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function deleteMapping(id: number): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("knowledge_mapping")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/* ---------------- 支护方案 ---------------- */

export async function createSupportScheme(
  input: Omit<SupportScheme, "no" | "custom">
): Promise<SupportScheme> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("support_scheme")
    .insert({ ...toDbScheme({ ...input, is_custom: true }), source: "manual" })
    .select("*")
    .single();
  if (error) throw error;
  return toScheme(data);
}

export async function importSupportSchemes(
  list: Array<Omit<SupportScheme, "no" | "custom">>
): Promise<number> {
  const client = getSupabaseClient();
  if (list.length === 0) return 0;
  const rows = list.map((r) => ({ ...toDbScheme({ ...r, is_custom: true }), source: "import" }));
  const { error } = await client.from("support_scheme").insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function deleteSupportScheme(id: number): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from("support_scheme").delete().eq("id", id);
  if (error) throw error;
}
