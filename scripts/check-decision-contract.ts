import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { decisionMetaSchema, inferMethodsResultSchema, supportDesignResultSchema, safetySchema, schemeReportSchema, decisionPayloadSchema } from '../src/lib/validation/decision-response';
import { saveDecisionSchema } from '../src/lib/validation/decision';

async function main(): Promise<void> {
  const { stdout } = await promisify(execFile)(process.env.BACKEND_PYTHON || 'python3', ['-m','tests.export_contract'],
    { cwd: path.resolve(process.cwd(), 'backend'), maxBuffer: 2 * 1024 * 1024 });
  const cases = z.object({ meta: decisionMetaSchema, inference: inferMethodsResultSchema, design: supportDesignResultSchema,
    safety: safetySchema, report: schemeReportSchema, save: saveDecisionSchema, snapshot: decisionPayloadSchema }).parse(JSON.parse(stdout));
  assert.equal(cases.inference.methods.find((method) => method.matched)?.key, 'bench');
  assert.equal(cases.snapshot.algorithmVersion, `${cases.design.algorithm.id}:${cases.design.algorithm.version}`);
  assert.equal(cases.snapshot.requestKey, cases.save.requestKey);
  assert.equal(cases.snapshot.report.algorithm.reference, true);
  console.info('Python 六个接口的真实 ASGI 响应均通过 TypeScript/Zod 契约校验。');
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
