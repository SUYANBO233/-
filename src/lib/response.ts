import { z } from 'zod';

export const evaluationContextSchema=z.object({ sectionId:z.string().trim().min(1).max(100),stage:z.enum(['initial-support','after-excavation']),displacementReference:z.enum(['since-excavation','total']) }).strict();
export const criterionSchema=z.object({
  code:z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),version:z.number().int().positive(),enabled:z.boolean(),
  metric:z.enum(['settlement','convergence']),name:z.string().trim().min(1).max(100),unit:z.literal('mm'),
  stage:z.enum(['initial-support','after-excavation']),displacementReference:z.enum(['since-excavation','total']),sectionTypes:z.array(z.string().trim().min(1)).min(1).max(30),
  operator:z.enum(['<=','>=','range']),lower:z.number().finite().nonnegative().nullable(),upper:z.number().finite().nonnegative().nullable(),required:z.boolean(),
  basis:z.string().trim().min(1).max(1000),source:z.enum(['manual','import','simulation']),testBatchId:z.string().max(100).nullable(),
}).strict().superRefine((c,ctx) => {
  if ((c.operator==='<=' && (c.upper===null || c.lower!==null)) || (c.operator==='>=' && (c.lower===null || c.upper!==null)) || (c.operator==='range' && (c.lower===null || c.upper===null || c.lower>c.upper))) ctx.addIssue({ code:'custom',message:'判据必须提供对应方向的有效边界（区间包含两端）' });
  if (c.source==='simulation' && !c.testBatchId) ctx.addIssue({ code:'custom',message:'测试判据必须有批次' });
});
export const responseResultSchema=z.object({
  status:z.enum(['available','partial','unavailable']),provider:z.object({ id:z.string(),version:z.string(),isTest:z.boolean(),testBatchId:z.string().nullable(),description:z.string() }),
  context:evaluationContextSchema.nullable(),inputDigest:z.string(),source:z.enum(['simulation','model','unavailable']),
  metrics:z.array(z.object({ key:z.enum(['settlement','convergence']),value:z.number().finite().nonnegative().nullable(),unit:z.string(),reason:z.string() })),reason:z.string(),
});
export const evaluationItemSchema=z.object({ key:z.enum(['settlement','convergence']),name:z.string(),value:z.number().finite().nullable(),unit:z.string(),status:z.enum(['satisfied','unsatisfied','unavailable']),required:z.boolean(),reason:z.string(),criterion:criterionSchema.nullable() });
export type EvaluationContext=z.infer<typeof evaluationContextSchema>;
export type EvaluationCriterion=z.infer<typeof criterionSchema>;
export type ResponseResult=z.infer<typeof responseResultSchema>;
export type EvaluationItem=z.infer<typeof evaluationItemSchema>;
export const DEFAULT_EVALUATION_CONTEXT:EvaluationContext={ sectionId:'当前掌子面断面',stage:'initial-support',displacementReference:'since-excavation' };
export function criterionCondition(c:EvaluationCriterion):string {
  return c.operator==='range' ? `${c.lower} ≤ 值 ≤ ${c.upper} ${c.unit}` : `${c.operator} ${c.operator==='<=' ? c.upper:c.lower} ${c.unit}`;
}
