import { z } from 'zod';
import { geoParamsSchema } from './validation/geo';

export const methodKeySchema = z.enum(['full', 'bench', 'core']);
const numericFields = ['depth', 'density', 'sharePrimary', 'shareSecondary', 'friction', 'elastic', 'cohesion', 'poisson', 'stressV', 'stressH'];
export const conditionFieldSchema = geoParamsSchema.keyof();
const scalar = z.union([z.string().min(1), z.number().finite()]);
export const conditionSchema = z.discriminatedUnion('op', [
  z.object({ field: conditionFieldSchema, op: z.literal('eq'), value: scalar }).strict(),
  z.object({ field: conditionFieldSchema, op: z.literal('in'), values: z.array(scalar).min(1).max(30) }).strict(),
  z.object({ field: conditionFieldSchema, op: z.literal('range'), min: z.number().finite().optional(), max: z.number().finite().optional(),
    minInclusive: z.boolean().default(true), maxInclusive: z.boolean().default(false) }).strict(),
]).superRefine((item, ctx) => {
  const numeric = numericFields.includes(item.field);
  if (item.op === 'range') {
    if (!numeric || (item.min === undefined && item.max === undefined) || (item.min !== undefined && item.max !== undefined && item.min >= item.max)) {
      ctx.addIssue({ code: 'custom', message: '区间必须用于数值字段，且下界小于上界，至少提供一个边界' });
    }
  } else {
    const values = item.op === 'eq' ? [item.value] : item.values;
    if (values.some((value) => numeric ? typeof value !== 'number' : typeof value !== 'string')) ctx.addIssue({ code: 'custom', message: '条件值类型与输入字段不一致' });
  }
});
export const conditionsSchema = z.object({ all: z.array(conditionSchema).min(1).max(30), excludeAny: z.array(conditionSchema).max(30).default([]) }).strict();
const provenance = { source: z.enum(['manual', 'import', 'simulation']), testBatchId: z.string().max(100).nullable().default(null) };
export const ruleSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), version: z.number().int().positive(), name: z.string().min(1).max(200),
  kind: z.enum(['method', 'support']), methodKey: methodKeySchema, priority: z.number().int().min(0).max(100000),
  enabled: z.boolean(), conditions: conditionsSchema, reason: z.string().min(1).max(1000),
  templateCode: z.string().nullable().default(null), templateVersion: z.number().int().positive().nullable().default(null), ...provenance,
}).strict().superRefine((rule, ctx) => {
  if (rule.kind === 'support' && (!rule.templateCode || rule.templateVersion === null)) ctx.addIssue({ code: 'custom', message: '支护规则必须指定模板编码和版本' });
  if (rule.kind === 'method' && (rule.templateCode !== null || rule.templateVersion !== null)) ctx.addIssue({ code: 'custom', message: '工法规则不引用支护模板' });
  if (rule.source === 'simulation' && !rule.testBatchId) ctx.addIssue({ code: 'custom', message: '合成规则必须标明测试批次' });
});
const positive = z.number().finite().positive();
export const structuredSupportSchema = z.object({
  steel: z.object({ model: z.string().trim().min(1), spacingCm: positive.max(1000) }).strict(),
  shot: z.object({ strength: z.string().trim().min(1), thicknessCm: positive.max(200) }).strict(),
  anchor: z.object({ type: z.string().trim().min(1), diameterMm: positive, lengthM: positive.max(100), longitudinalSpacingCm: positive, circumferentialSpacingCm: positive }).strict(),
  advance: z.object({ type: z.string().trim().min(1), diameterMm: positive, lengthM: positive, ringSpacingCm: positive.max(1000), scope: z.string().trim().min(1) }).strict(),
}).strict();
export const templateSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), version: z.number().int().positive(), name: z.string().trim().min(1).max(40),
  enabled: z.boolean(), parameters: structuredSupportSchema, ...provenance,
}).strict().superRefine((item, ctx) => {
  if (item.source === 'simulation' && !item.testBatchId) ctx.addIssue({ code: 'custom', message: '合成模板必须标明测试批次' });
});
export const observationSchema = z.object({
  id: z.uuid(), workface: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), mileage: z.string().regex(/^K\d{1,8}\+\d{1,3}(?:\.\d{1,3})?$/),
  observedAt: z.iso.datetime({ offset: true }), params: geoParamsSchema.partial(), ...provenance,
}).strict().superRefine((item, ctx) => {
  const tail = Number(item.mileage.split('+')[1]);
  if (tail >= 1000) ctx.addIssue({ code: 'custom', message: '桩号米段必须小于 1000' });
  if (item.source === 'simulation' && !item.testBatchId) ctx.addIssue({ code: 'custom', message: '合成采集记录必须标明测试批次' });
});
export const catalogImportSchema = z.object({
  formatVersion: z.literal(1), rules: z.array(ruleSchema).max(500).default([]), templates: z.array(templateSchema).max(500).default([]), observations: z.array(observationSchema).max(500).default([]),
}).strict().superRefine((bundle, ctx) => {
  if (!bundle.rules.length && !bundle.templates.length && !bundle.observations.length) ctx.addIssue({ code: 'custom', message: '导入内容不能为空' });
  for (const list of [bundle.rules, bundle.templates]) {
    if (new Set(list.map((item) => `${item.code}:${item.version}`)).size !== list.length) ctx.addIssue({ code: 'custom', message: '同一批次中编码和版本不能重复' });
  }
  if (new Set(bundle.observations.map((item) => item.id)).size !== bundle.observations.length) ctx.addIssue({ code: 'custom', message: '采集 ID 不能重复' });
});
export type DecisionRule = z.infer<typeof ruleSchema>;
export type SupportTemplate = z.infer<typeof templateSchema>;
export type StructuredSupport = z.infer<typeof structuredSupportSchema>;
export type GeoObservation = z.infer<typeof observationSchema>;
export type CatalogImport = z.infer<typeof catalogImportSchema>;
export const FIELD_LABELS: Record<z.infer<typeof conditionFieldSchema>, string> = {
  hardness: '坚硬程度', integrity: '完整程度', thickness: '岩层厚度', water: '地下水量', grade: '围岩级别', depth: '埋深 m',
  section: '断面类型', density: '密度 kg/m³', sharePrimary: '初支承担比例', shareSecondary: '二衬承担比例', friction: '内摩擦角 °',
  elastic: '弹性模量 GPa', cohesion: '黏聚力 kPa', poisson: '泊松比', stressV: '竖向应力 MPa', stressH: '水平应力 MPa',
};
