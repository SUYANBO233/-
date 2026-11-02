import { relations } from 'drizzle-orm';
import {
  project, tunnel, workface, tunnelSegment, constructionMethod, supportScheme,
  knowledgeMapping, geoObservation, decisionRun, decisionRevision, schemeReport, schemeHistory,
} from './schema';

export const projectRelations = relations(project, ({ many }) => ({ tunnels: many(tunnel) }));
export const tunnelRelations = relations(tunnel, ({ one, many }) => ({
  project: one(project, { fields: [tunnel.projectId], references: [project.id] }),
  workfaces: many(workface), segments: many(tunnelSegment),
}));
export const workfaceRelations = relations(workface, ({ one, many }) => ({
  tunnel: one(tunnel, { fields: [workface.tunnelId], references: [tunnel.id] }),
  observations: many(geoObservation), decisions: many(decisionRun), history: many(schemeHistory),
}));
export const methodRelations = relations(constructionMethod, ({ many }) => ({
  segments: many(tunnelSegment), revisions: many(decisionRevision), history: many(schemeHistory),
}));
export const supportSchemeRelations = relations(supportScheme, ({ many }) => ({
  mappings: many(knowledgeMapping), segments: many(tunnelSegment), revisions: many(decisionRevision),
}));
export const mappingRelations = relations(knowledgeMapping, ({ one }) => ({
  scheme: one(supportScheme, { fields: [knowledgeMapping.supportSchemeId], references: [supportScheme.id] }),
}));
export const segmentRelations = relations(tunnelSegment, ({ one }) => ({
  tunnel: one(tunnel, { fields: [tunnelSegment.tunnelId], references: [tunnel.id] }),
  method: one(constructionMethod, { fields: [tunnelSegment.methodId], references: [constructionMethod.id] }),
  scheme: one(supportScheme, { fields: [tunnelSegment.supportSchemeId], references: [supportScheme.id] }),
}));
export const observationRelations = relations(geoObservation, ({ one, many }) => ({
  workface: one(workface, { fields: [geoObservation.workfaceId], references: [workface.id] }),
  decisions: many(decisionRun),
}));
export const runRelations = relations(decisionRun, ({ one, many }) => ({
  workface: one(workface, { fields: [decisionRun.workfaceId], references: [workface.id] }),
  observation: one(geoObservation, { fields: [decisionRun.geoObservationId], references: [geoObservation.id] }),
  revisions: many(decisionRevision), history: many(schemeHistory),
}));
export const revisionRelations = relations(decisionRevision, ({ one }) => ({
  run: one(decisionRun, { fields: [decisionRevision.decisionRunId], references: [decisionRun.id] }),
  method: one(constructionMethod, { fields: [decisionRevision.methodId], references: [constructionMethod.id] }),
  scheme: one(supportScheme, { fields: [decisionRevision.supportSchemeId], references: [supportScheme.id] }),
  report: one(schemeReport),
}));
export const reportRelations = relations(schemeReport, ({ one }) => ({
  revision: one(decisionRevision, { fields: [schemeReport.decisionRevisionId], references: [decisionRevision.id] }),
  history: one(schemeHistory),
}));
export const historyRelations = relations(schemeHistory, ({ one }) => ({
  workface: one(workface, { fields: [schemeHistory.workfaceId], references: [workface.id] }),
  method: one(constructionMethod, { fields: [schemeHistory.methodId], references: [constructionMethod.id] }),
  run: one(decisionRun, { fields: [schemeHistory.decisionRunId], references: [decisionRun.id] }),
  report: one(schemeReport, { fields: [schemeHistory.schemeReportId], references: [schemeReport.id] }),
}));
