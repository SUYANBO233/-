import {
  pgTable, serial, timestamp, varchar, integer, numeric, boolean, index,
  text, uuid, jsonb, uniqueIndex, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { GeoParams, MethodMatch, SafetyAssessment, SchemeReport, SupportComponent, TunnelSegment } from '@/lib/types';

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const provenance = () => ({
  seedKey: text('seed_key'),
  source: text('source').default('legacy').notNull(),
});

export const healthCheck = pgTable('health_check', {
  id: serial().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const project = pgTable('project', {
  id: serial('id').primaryKey(), code: text('code').notNull().unique(),
  name: text('name').notNull(), location: text('location'),
  status: text('status').notNull().default('active'), createdAt: createdAt(),
});

export const tunnel = pgTable('tunnel', {
  id: serial('id').primaryKey(), projectId: integer('project_id').notNull().references(() => project.id),
  code: text('code').notNull().unique(), name: text('name').notNull(), kind: text('kind').notNull(),
  startChainageM: numeric('start_chainage_m', { precision: 14, scale: 3 }).notNull(),
  endChainageM: numeric('end_chainage_m', { precision: 14, scale: 3 }).notNull(),
  lengthM: numeric('length_m', { precision: 14, scale: 3 }).notNull(), createdAt: createdAt(),
}, (t) => [
  check('tunnel_kind_check', sql`${t.kind} in ('main','pilot')`),
  check('tunnel_length_m_check', sql`${t.lengthM} > 0`),
]);

export const workface = pgTable('workface', {
  id: serial('id').primaryKey(), tunnelId: integer('tunnel_id').notNull().references(() => tunnel.id),
  code: text('code').notNull().unique(), name: text('name').notNull(),
  direction: integer('direction').notNull().default(1),
  currentChainageM: numeric('current_chainage_m', { precision: 14, scale: 3 }),
  status: text('status').notNull().default('active'), createdAt: createdAt(),
}, (t) => [index('workface_tunnel_idx').on(t.tunnelId), check('workface_direction_check', sql`${t.direction} in (-1,1)`)]);

export const constructionMethod = pgTable('construction_method', {
  id: serial('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(),
  version: integer('version').notNull().default(1), geology: text('geology').notNull(),
  section: text('section').notNull(), advantage: text('advantage').notNull(),
  equipmentText: text('equipment_text').notNull(), rockGrades: jsonb('rock_grades').$type<string[]>().notNull(),
  cycleHours: numeric('cycle_hours', { precision: 8, scale: 2 }).notNull(),
  advanceM: numeric('advance_m', { precision: 8, scale: 3 }).notNull(),
  shotcreteThicknessMm: numeric('shotcrete_thickness_mm', { precision: 8, scale: 2 }).notNull(),
  monthlyAdvanceM: numeric('monthly_advance_m', { precision: 10, scale: 3 }).notNull(),
  description: text('description').notNull(), tone: text('tone').notNull().default('brand'),
  source: text('source').notNull().default('manual'), createdAt: createdAt(),
}, (t) => [
  check('construction_method_version_check', sql`${t.version} > 0`),
  check('construction_method_cycle_hours_check', sql`${t.cycleHours} > 0`),
  check('construction_method_advance_m_check', sql`${t.advanceM} > 0`),
  check('construction_method_shotcrete_thickness_mm_check', sql`${t.shotcreteThicknessMm} > 0`),
  check('construction_method_monthly_advance_m_check', sql`${t.monthlyAdvanceM} > 0`),
]);

export const equipment = pgTable('equipment', {
  id: serial('id').primaryKey(), name: varchar('name', { length: 100 }).notNull(),
  model: varchar('model', { length: 120 }).notNull(), num: integer('num').default(1).notNull(),
  unit: varchar('unit', { length: 20 }).default('台').notNull(), pos: text('pos').notNull(),
  stage: varchar('stage', { length: 60 }).notNull(),
  isCustom: boolean('is_custom').default(true).notNull(), ...provenance(), createdAt: createdAt(),
}, (t) => [index('equipment_stage_idx').on(t.stage), uniqueIndex('equipment_seed_key_uidx').on(t.seedKey)]);

export const supportScheme = pgTable('support_scheme', {
  id: serial('id').primaryKey(),
  no: integer('no').notNull().default(sql`nextval('public.support_scheme_no_seq')`),
  rock: varchar('rock', { length: 20 }).notNull(), type: varchar('type', { length: 40 }).notNull(),
  depth: varchar('depth', { length: 60 }).notNull(), advType: varchar('adv_type', { length: 120 }).notNull(),
  advRing: varchar('adv_ring', { length: 40 }).notNull(), advLen: varchar('adv_len', { length: 40 }).notNull(),
  advScope: varchar('adv_scope', { length: 60 }).notNull(), anchor: varchar('anchor', { length: 120 }).notNull(),
  steel: varchar('steel', { length: 120 }).notNull(), shot: varchar('shot', { length: 120 }).notNull(),
  conc: varchar('conc', { length: 120 }).notNull(), thick: varchar('thick', { length: 40 }).notNull(),
  mode: varchar('mode', { length: 60 }).notNull(), advRate: varchar('adv_rate', { length: 40 }).notNull(),
  benchLen: varchar('bench_len', { length: 40 }).notNull(), isCustom: boolean('is_custom').default(true).notNull(),
  version: integer('version').notNull().default(1), parameters: jsonb('parameters').notNull().default({}),
  ...provenance(), createdAt: createdAt(),
}, (t) => [index('support_scheme_rock_idx').on(t.rock), uniqueIndex('support_scheme_seed_key_uidx').on(t.seedKey)]);

export const knowledgeMapping = pgTable('knowledge_mapping', {
  id: serial('id').primaryKey(), no: integer('no').notNull().default(sql`nextval('public.knowledge_mapping_no_seq')`),
  code: varchar('code', { length: 40 }).notNull(), hard: varchar('hard', { length: 80 }).notNull(),
  intact: varchar('intact', { length: 60 }).notNull(), water: varchar('water', { length: 60 }).notNull(),
  depth: varchar('depth', { length: 60 }).notNull(), stress: varchar('stress', { length: 60 }).notNull(),
  rock: varchar('rock', { length: 20 }).notNull(), scheme: varchar('scheme', { length: 120 }).notNull(),
  supportSchemeId: integer('support_scheme_id').references(() => supportScheme.id),
  conditions: jsonb('conditions').notNull().default({}), isCustom: boolean('is_custom').default(true).notNull(),
  ...provenance(), createdAt: createdAt(),
}, (t) => [uniqueIndex('knowledge_mapping_seed_key_uidx').on(t.seedKey)]);

export const tunnelSegment = pgTable('tunnel_segment', {
  id: serial('id').primaryKey(), tunnelId: integer('tunnel_id').notNull().references(() => tunnel.id),
  seedKey: text('seed_key').unique(), startChainageM: numeric('start_chainage_m', { precision: 14, scale: 3 }).notNull(),
  endChainageM: numeric('end_chainage_m', { precision: 14, scale: 3 }).notNull(),
  lengthM: numeric('length_m', { precision: 14, scale: 3 }).notNull(),
  methodId: integer('method_id').references(() => constructionMethod.id),
  supportSchemeId: integer('support_scheme_id').references(() => supportScheme.id),
  designVersion: integer('design_version').notNull().default(1),
  snapshot: jsonb('snapshot').$type<TunnelSegment>().notNull(), source: text('source').notNull().default('manual'),
  createdAt: createdAt(),
}, (t) => [
  index('tunnel_segment_tunnel_start_idx').on(t.tunnelId, t.startChainageM),
  check('tunnel_segment_length_m_check', sql`${t.lengthM} > 0`),
  check('tunnel_segment_design_version_check', sql`${t.designVersion} > 0`),
  check('tunnel_segment_check', sql`${t.endChainageM} > ${t.startChainageM}`),
]);

export const geoObservation = pgTable('geo_observation', {
  id: uuid('id').primaryKey().defaultRandom(), workfaceId: integer('workface_id').notNull().references(() => workface.id),
  seedKey: text('seed_key').unique(), chainageM: numeric('chainage_m', { precision: 14, scale: 3 }).notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(), source: text('source').notNull(),
  rockGrade: text('rock_grade').notNull(), params: jsonb('params').$type<GeoParams>().notNull(), createdAt: createdAt(),
}, (t) => [
  index('geo_observation_workface_time_idx').on(t.workfaceId, t.observedAt),
  check('geo_observation_rock_grade_check', sql`${t.rockGrade} in ('I','II','III','IV','V','VI')`),
  check('geo_observation_params_check', sql`jsonb_typeof(${t.params}) = 'object'`),
]);

export const decisionRun = pgTable('decision_run', {
  id: uuid('id').primaryKey().defaultRandom(), requestKey: uuid('request_key').notNull().unique(),
  payloadHash: text('payload_hash').notNull(), workfaceId: integer('workface_id').notNull().references(() => workface.id),
  geoObservationId: uuid('geo_observation_id').references(() => geoObservation.id),
  mode: text('mode').notNull(), executionChannel: text('execution_channel').notNull(),
  algorithmVersion: text('algorithm_version').notNull(), source: text('source').notNull(),
  inputSnapshot: jsonb('input_snapshot').notNull(), status: text('status').notNull().default('completed'),
  createdAt: createdAt(),
}, (t) => [
  index('decision_run_workface_time_idx').on(t.workfaceId, t.createdAt),
  check('decision_run_mode_check', sql`${t.mode} in ('joint','manual')`),
  check('decision_run_execution_channel_check', sql`${t.executionChannel} in ('mock','real')`),
  check('decision_run_status_check', sql`${t.status} in ('completed','failed')`),
  check('decision_run_input_snapshot_check', sql`jsonb_typeof(${t.inputSnapshot}) = 'object'`),
]);

export const decisionRevision = pgTable('decision_revision', {
  id: uuid('id').primaryKey().defaultRandom(), decisionRunId: uuid('decision_run_id').notNull().references(() => decisionRun.id),
  revision: integer('revision').notNull(), methodId: integer('method_id').notNull().references(() => constructionMethod.id),
  supportSchemeId: integer('support_scheme_id').references(() => supportScheme.id),
  methodSnapshot: jsonb('method_snapshot').notNull(), candidatesSnapshot: jsonb('candidates_snapshot').$type<MethodMatch[]>().notNull(),
  supportSnapshot: jsonb('support_snapshot').$type<SupportComponent[]>().notNull(),
  safetySnapshot: jsonb('safety_snapshot').$type<SafetyAssessment>().notNull(), reason: text('reason').notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex('decision_revision_decision_run_id_revision_key').on(t.decisionRunId, t.revision), check('decision_revision_revision_check', sql`${t.revision} > 0`)]);

export const schemeReport = pgTable('scheme_report', {
  id: uuid('id').primaryKey().defaultRandom(), no: text('no').notNull().unique(),
  decisionRevisionId: uuid('decision_revision_id').notNull().unique().references(() => decisionRevision.id),
  content: jsonb('content').$type<SchemeReport>().notNull(), fileUrl: text('file_url'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('scheme_report_content_check', sql`jsonb_typeof(${t.content}) = 'object'`)]);

export const schemeHistory = pgTable('scheme_history', {
  id: serial('id').primaryKey(), time: varchar('time', { length: 40 }).notNull(),
  face: varchar('face', { length: 200 }).notNull(), startMile: varchar('start_mile', { length: 40 }).notNull(),
  endMile: varchar('end_mile', { length: 40 }).notNull(), advance: varchar('advance', { length: 20 }).notNull(),
  rock: varchar('rock', { length: 20 }).notNull(), method: varchar('method', { length: 60 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(), score: numeric('score', { precision: 6, scale: 2 }).notNull(),
  detail: text('detail').notNull(), custom: boolean('custom').default(false).notNull(),
  advanceM: numeric('advance_m', { precision: 12, scale: 3 }), cycleDurationMinutes: integer('cycle_duration_minutes'),
  workfaceId: integer('workface_id').references(() => workface.id),
  methodId: integer('method_id').references(() => constructionMethod.id),
  decisionRunId: uuid('decision_run_id').references(() => decisionRun.id),
  schemeReportId: uuid('scheme_report_id').references(() => schemeReport.id), ...provenance(), createdAt: createdAt(),
}, (t) => [
  uniqueIndex('scheme_history_seed_key_uidx').on(t.seedKey), uniqueIndex('scheme_history_report_uidx').on(t.schemeReportId),
  index('scheme_history_face_time_idx').on(t.face, t.time), index('scheme_history_workface_time_idx').on(t.workfaceId, t.time),
]);
