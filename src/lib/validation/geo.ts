import { z } from 'zod';
import type { GeoParams } from '@/lib/types';

export const geoParamsSchema = z.object({
  hardness: z.string().min(1).max(80), integrity: z.string().min(1).max(80),
  thickness: z.string().min(1).max(80), water: z.string().min(1).max(80),
  grade: z.enum(['I','II','III','IV','V','VI']), depth: z.number().min(0).max(20000),
  section: z.string().min(1).max(120), density: z.number().positive().max(10000),
  sharePrimary: z.number().min(0).max(1), shareSecondary: z.number().min(0).max(1),
  friction: z.number().min(0).max(90), elastic: z.number().positive(), cohesion: z.number().min(0),
  poisson: z.number().gt(-1).lt(0.5), stressV: z.number().min(0), stressH: z.number().min(0),
}).strict() satisfies z.ZodType<GeoParams>;
