import { z } from 'zod';
import type { AlgorithmInfo, DecisionMeta, InferMethodsResult, SafetyAssessment, SchemeReport, SupportDesignResult } from '@/lib/types';

export const algorithmInfoSchema = z.object({
  id: z.string().min(1), version: z.string().min(1), reference: z.boolean(), description: z.string(),
}) satisfies z.ZodType<AlgorithmInfo>;
const methodSchema = z.object({
  key: z.string().min(1), name: z.string(), rock: z.string(), cycle: z.string(), adv: z.string(),
  shot: z.string(), month: z.string(), desc: z.string(), equip: z.string(),
  score: z.number().min(0).max(100), matched: z.boolean(),
});
const supportSchema = z.object({
  key: z.enum(['steel','shot','anchor','advance']), label: z.string(), spec: z.string(), layout: z.string(),
  valNum: z.number().positive(), unit: z.string(), basis: z.string(), conf: z.number().min(0).max(1), color: z.string(),
});
const supportsSchema = z.array(supportSchema).length(4).refine((items) => new Set(items.map((item) => item.key)).size === 4, '支护构件不能重复');
export const mechanismSchema = z.object({ height: z.string(), release: z.string(), closeTime: z.string() });
export const safetySchema = z.object({
  score: z.number().min(0).max(100), tag: z.string(), reason: z.string(),
  radar: z.object({ labels: z.array(z.string()).min(1), data: z.array(z.number().min(0).max(100)).min(1) })
    .refine((value) => value.labels.length === value.data.length, '雷达指标数量不一致'),
  algorithm: algorithmInfoSchema.optional(),
}) satisfies z.ZodType<SafetyAssessment>;
const reportRowSchema = z.object({ process: z.string(), spec: z.string(), quantity: z.string(), basis: z.string() });
export const schemeReportSchema = z.object({
  no: z.string().min(1), time: z.string(), mile: z.string(), grade: z.string(), method: z.string(),
  rows: z.array(reportRowSchema).min(1), algorithm: algorithmInfoSchema.optional(),
}) satisfies z.ZodType<SchemeReport>;
export const inferMethodsResultSchema = z.object({
  methods: z.array(methodSchema).min(1).refine((items) => items.filter((item) => item.matched).length === 1
    && new Set(items.map((item) => item.key)).size === items.length, '候选工法或推荐标记不合法'),
  algorithm: algorithmInfoSchema,
}) satisfies z.ZodType<InferMethodsResult>;
export const supportDesignResultSchema = z.object({
  support: supportsSchema, safety: safetySchema, mechanism: mechanismSchema, algorithm: algorithmInfoSchema,
}) satisfies z.ZodType<SupportDesignResult>;
export const decisionMetaSchema = z.object({
  workfaces: z.array(z.object({ value: z.string(), label: z.string(), grade: z.enum(['I','II','III','IV','V','VI']) })).min(1),
  mileages: z.array(z.object({ value: z.string(), label: z.string(), mile: z.string() })).min(1),
  algorithm: algorithmInfoSchema.optional(),
}) satisfies z.ZodType<DecisionMeta>;

export function parseDecisionResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error('算法服务返回的数据格式不符合接口契约，请检查后端实现');
  return result.data;
}

export const decisionPayloadSchema = z.object({
  requestKey: z.uuid(), workface: z.string(), mode: z.enum(['joint','manual']),
  channel: z.enum(['mock','real']), algorithmVersion: z.string(), source: z.enum(['simulation','algorithm']),
  input: z.object({ params: z.record(z.string(), z.unknown()), mileage: z.string(), workface: z.string() }),
  candidates: z.array(methodSchema).min(1),
  revisions: z.array(z.object({ methodKey: z.enum(['full','bench','core']), support: supportsSchema, safety: safetySchema, reason: z.string() })).min(1),
  report: z.object({ mile: z.string(), grade: z.string(), method: z.string(), rows: z.array(reportRowSchema).min(1), algorithm: algorithmInfoSchema }),
});
