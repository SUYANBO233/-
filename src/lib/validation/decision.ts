import { z } from 'zod';
import { algorithmInfoSchema } from './decision-response';
import type { GeoParams, SaveDecisionRequest } from '@/lib/types';

export const geoParamsSchema = z.object({
  hardness: z.string().min(1).max(80), integrity: z.string().min(1).max(80),
  thickness: z.string().min(1).max(80), water: z.string().min(1).max(80),
  grade: z.enum(['I','II','III','IV','V','VI']), depth: z.number().min(0).max(20000),
  section: z.string().min(1).max(120), density: z.number().positive().max(10000),
  sharePrimary: z.number().min(0).max(1), shareSecondary: z.number().min(0).max(1),
  friction: z.number().min(0).max(90), elastic: z.number().positive(), cohesion: z.number().min(0),
  poisson: z.number().gt(-1).lt(0.5), stressV: z.number().min(0), stressH: z.number().min(0),
}) satisfies z.ZodType<GeoParams>;

export const saveDecisionSchema = z.object({
  algorithm: algorithmInfoSchema.optional(),
  requestKey: z.uuid(), mode: z.enum(['joint','manual']),
  workface: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  mileage: z.string().regex(/^K\d{1,8}\+\d{1,3}(?:\.\d{1,3})?$/i),
  params: geoParamsSchema,
  revisions: z.array(z.object({
    methodKey: z.enum(['full','bench','core']), reason: z.string().min(1).max(200),
    values: z.object({
      steel: z.number().positive().max(1000), shot: z.number().positive().max(200),
      anchor: z.number().positive().max(100), advance: z.number().positive().max(1000),
    }),
  })).min(1).max(1000),
}) satisfies z.ZodType<SaveDecisionRequest>;
