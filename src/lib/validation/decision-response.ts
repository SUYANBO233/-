import { z } from 'zod';
import { evaluationContextSchema,criterionSchema,responseResultSchema,evaluationItemSchema } from '../response';
import { templateSchema, observationSchema } from '../decision-catalog';
import type { AlgorithmInfo, DecisionMeta, InferMethodsResult, SafetyAssessment, SchemeReport, SupportDesignResult } from '@/lib/types';

export const algorithmInfoSchema = z.object({
  capabilities:z.array(z.string()).optional(),id: z.string().min(1), version: z.string().min(1), reference: z.boolean(), description: z.string(),
}) satisfies z.ZodType<AlgorithmInfo>;
const methodSchema = z.object({
  key: z.string().min(1), name: z.string(), rock: z.string(), cycle: z.string(), adv: z.string(),
  shot: z.string(), month: z.string(), desc: z.string(), equip: z.string(),
  score: z.number().min(0).max(100).nullable(), matched: z.boolean(),
  status:z.enum(['recommended','candidate','inapplicable','insufficient','uncovered']).nullable().optional(),
  reasons:z.array(z.string()).optional(),rules:z.array(z.object({ code:z.string(),version:z.number().int(),priority:z.number().int() })).optional(),priority:z.number().nullable().optional(),
});
const supportSchema = z.object({
  key: z.enum(['steel','shot','anchor','advance']), label: z.string(), spec: z.string(), layout: z.string(),
  valNum: z.number().positive(), unit: z.string(), basis: z.string(), conf: z.number().min(0).max(1).nullable(), color: z.string(), parameters:z.record(z.string(),z.union([z.string(),z.number()])).nullable().optional(),
});
const supportsSchema = z.array(supportSchema).length(4).refine((items) => new Set(items.map((item) => item.key)).size === 4, '支护构件不能重复');
export const mechanismSchema = z.object({ height: z.string(), release: z.string(), closeTime: z.string() });
export const safetySchema = z.object({
  response:responseResultSchema.nullable().optional(),items:z.array(evaluationItemSchema).optional(),criteriaSnapshot:z.array(criterionSchema).optional(),isTest:z.boolean().optional(),
  status:z.enum(['reference','unavailable','satisfied','unsatisfied']).optional(),scope:z.string().optional(),
  score: z.number().min(0).max(100).nullable(), tag: z.string(), reason: z.string(),
  radar: z.object({ labels: z.array(z.string()).min(1), data: z.array(z.number().min(0).max(100)).min(1) })
    .refine((value) => value.labels.length === value.data.length, '雷达指标数量不一致').nullable(),
  algorithm: algorithmInfoSchema.optional(),
}) satisfies z.ZodType<SafetyAssessment>;
const reportRowSchema = z.object({ process: z.string(), spec: z.string(), quantity: z.string(), basis: z.string() });
export const schemeReportSchema = z.object({
  evaluation:safetySchema.nullable().optional(),baselineEvaluation:safetySchema.nullable().optional(),
  no: z.string().min(1), time: z.string(), mile: z.string(), grade: z.string(), method: z.string(),
  rows: z.array(reportRowSchema).min(1), algorithm: algorithmInfoSchema.optional(),
}) satisfies z.ZodType<SchemeReport>;
export const inferMethodsResultSchema = z.object({
  methods: z.array(methodSchema).min(1).refine((items) => new Set(items.map((item) => item.key)).size === items.length, '候选工法或推荐标记不合法'),
  algorithm: algorithmInfoSchema,
}) satisfies z.ZodType<InferMethodsResult>;
export const supportDesignResultSchema = z.object({
  support: supportsSchema, safety: safetySchema, mechanism: mechanismSchema.nullable(), template:z.object({ code:z.string(),version:z.number().int().positive() }).nullable().optional(), algorithm: algorithmInfoSchema,
}) satisfies z.ZodType<SupportDesignResult>;
export const decisionMetaSchema = z.object({
  workfaces: z.array(z.object({ value: z.string(), label: z.string(), grade: z.enum(['I','II','III','IV','V','VI']) })),
  mileages: z.array(z.object({ value: z.string(), label: z.string(), mile: z.string() })),
  algorithm: algorithmInfoSchema.optional(),
}) satisfies z.ZodType<DecisionMeta>;

export function parseDecisionResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error('算法服务返回的数据格式不符合接口契约，请检查后端实现');
  return result.data;
}

export const decisionPayloadSchema = z.object({
  isTest:z.boolean().optional(),
  requestKey: z.uuid(), workface: z.string(), mode: z.enum(['joint','manual']),
  channel: z.enum(['mock','real']), algorithmVersion: z.string(), source: z.enum(['simulation','algorithm']),
  input: z.object({ evaluationContext:evaluationContextSchema.nullable().optional(),params: z.record(z.string(), z.unknown()), mileage: z.string(), workface: z.string(),origin:z.record(z.string(),z.unknown()).nullable().optional() }),
  candidates: z.array(methodSchema).min(1),
  revisions: z.array(z.object({ methodKey: z.enum(['full','bench','core']), support: supportsSchema, safety: safetySchema, reason: z.string(),template:templateSchema.nullable().optional(),rules:z.array(z.record(z.string(),z.unknown())).optional() })).min(1),
  report: z.object({ evaluation:safetySchema.nullable().optional(),baselineEvaluation:safetySchema.nullable().optional(),schemaVersion:z.number().optional(),mile: z.string(), grade: z.string(), method: z.string(), rows: z.array(reportRowSchema).min(1), algorithm: algorithmInfoSchema }),
});

export const synchronizeSchema = z.object({
  status:z.enum(['found','not_found','conflict','incomplete']),observation:observationSchema.nullable(),
  candidates:z.array(observationSchema),missing:z.array(z.string()),message:z.string(),algorithm:algorithmInfoSchema,
});
export const supportOptionsSchema = z.object({ options:z.array(templateSchema),algorithm:algorithmInfoSchema });
