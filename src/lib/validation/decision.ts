import { z } from 'zod';
import { evaluationContextSchema } from '../response';
import { algorithmInfoSchema } from './decision-response';
import type { SaveDecisionRequest } from '@/lib/types';

import { geoParamsSchema } from './geo';
export { geoParamsSchema } from './geo';

export const saveDecisionSchema = z.object({
  evaluationContext:evaluationContextSchema.nullable().optional(),
  observationId:z.uuid().nullable().optional(),
  algorithm: algorithmInfoSchema.optional(),
  requestKey: z.uuid(), mode: z.enum(['joint','manual']),
  workface: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  mileage: z.string().regex(/^K\d{1,8}\+\d{1,3}(?:\.\d{1,3})?$/i),
  params: geoParamsSchema.partial(),
  revisions: z.array(z.object({
    template:z.object({ code:z.string(),version:z.number().int().positive() }).nullable().optional(),manualReason:z.string().max(500).optional(),
    methodKey: z.enum(['full','bench','core']), reason: z.string().min(1).max(200),
    values: z.object({
      steel: z.number().positive().max(1000), shot: z.number().positive().max(200),
      anchor: z.number().positive().max(100), advance: z.number().positive().max(1000),
    }),
  })).min(1).max(1000),
}) satisfies z.ZodType<SaveDecisionRequest>;
