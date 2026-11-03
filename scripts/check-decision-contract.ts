import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { decisionMetaSchema, inferMethodsResultSchema, supportDesignResultSchema, safetySchema, schemeReportSchema, decisionPayloadSchema,synchronizeSchema,supportOptionsSchema } from '../src/lib/validation/decision-response';
import { saveDecisionSchema } from '../src/lib/validation/decision';

async function main(): Promise<void> {
  for (const extra of [[],['--d1'],['--d2']]) {
    const { stdout } = await promisify(execFile)(process.env.BACKEND_PYTHON || 'python3',['-m','tests.export_contract',...extra],
      { cwd:path.resolve(process.cwd(),'backend'),maxBuffer:2*1024*1024 });
    const cases = z.object({ meta:decisionMetaSchema,inference:inferMethodsResultSchema,design:supportDesignResultSchema,
      safety:safetySchema,report:schemeReportSchema,save:saveDecisionSchema,snapshot:decisionPayloadSchema,
      synchronize:synchronizeSchema.optional(),options:supportOptionsSchema.optional() }).parse(JSON.parse(stdout));
    assert.equal(cases.inference.methods.find((method) => method.matched)?.key,'bench');
    assert.equal(cases.snapshot.algorithmVersion,`${cases.design.algorithm.id}:${cases.design.algorithm.version}`);
    assert.equal(cases.snapshot.requestKey,cases.save.requestKey);
    assert.equal(cases.snapshot.report.algorithm.reference,true);
    if (extra.length) {
      assert.equal(cases.synchronize?.status,'found');
      assert.equal(cases.options?.options.length,1);
      assert.equal(cases.safety.status,extra[0]==='--d2' ? 'satisfied':'unavailable');
      if (extra[0]==='--d2') {
        assert.equal(cases.safety.items?.[0].value,8);assert.equal(cases.safety.items?.[1].value,6);
        assert.equal(cases.snapshot.report.evaluation?.isTest,true);
        assert.equal(cases.snapshot.input.evaluationContext?.stage,'initial-support');
      }
      assert.equal(cases.safety.score,null);
      assert.equal(cases.design.support[2].parameters?.diameterMm,22);
      assert.equal(cases.snapshot.revisions[0].template?.code,'test_iv_main');
    }
  }
  console.info('旧参考、D1 和 D2 实际 Python ASGI 响应均通过 TypeScript/Zod 契约校验，覆盖同步与模板候选。');
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
