import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { migrateDatabase } from '../src/storage/database/migrate';
import { sqlClient } from '../src/server/catalog-store';
import { seedD1Fixtures } from '../src/storage/database/d1-seed';
import { seedD2Fixtures } from '../src/storage/database/d2-seed';
import { criterionSchema } from '../src/lib/response';
import { D2_CRITERIA } from '../src/data/d2-fixtures';
import { decisionPayloadSchema } from '../src/lib/validation/decision-response';

test('D2 判据版本、权限与实际 Python 评价快照落库',async (t) => {
  const db=new PGlite();
  try {
    await db.exec('CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon;');
    await migrateDatabase(sqlClient(db));await seedD1Fixtures(sqlClient(db));await seedD2Fixtures(sqlClient(db));
    await t.test('重复初始化保留判据手动启用状态与版本内容',async () => {
      await db.query("SELECT set_evaluation_criterion_enabled('test_settlement_limit',2,true)");
      await seedD2Fixtures(sqlClient(db));
      const active=await db.query<{ version:number }>("SELECT version FROM evaluation_criterion WHERE code='test_settlement_limit' AND enabled");
      assert.deepEqual(active.rows,[{ version:2 }]);
      await assert.rejects(db.query('SELECT publish_evaluation_criterion($1::jsonb)',[JSON.stringify({ ...D2_CRITERIA[0],upper:99 })]),/different content/);
      await db.query("SELECT set_evaluation_criterion_enabled('test_settlement_limit',1,true)");
    });
    await t.test('运算符、单位、端点和测试来源的输入校验',() => {
      const c=D2_CRITERIA[0];
      assert.equal(criterionSchema.safeParse({ ...c,unit:'cm' }).success,false);
      assert.equal(criterionSchema.safeParse({ ...c,operator:'range',lower:11,upper:10 }).success,false);
      assert.equal(criterionSchema.safeParse({ ...c,upper:null }).success,false);
      assert.equal(criterionSchema.safeParse({ ...c,testBatchId:null }).success,false);
      assert.equal(criterionSchema.safeParse({ ...c,operator:'>=',lower:5,upper:null }).success,true);
    });
    await t.test('一致快照读取完整判据；匿名角色无权发布与启停',async () => {
      const snapshot=await db.query<{ result:{ criteria:unknown[] } }>('SELECT read_decision_catalog() AS result');
      assert.equal(snapshot.rows[0].result.criteria.length,4);
      const rights=await db.query<{ publish:boolean;enable:boolean }>("SELECT has_function_privilege('anon','publish_evaluation_criterion(jsonb)','EXECUTE') AS publish,has_function_privilege('anon','set_evaluation_criterion_enabled(text,integer,boolean)','EXECUTE') AS enable");
      assert.deepEqual(rights.rows,[{ publish:false,enable:false }]);
    });
    await t.test('实际 D2 快照保存评价、响应、版本、口径；判据变化不改写旧报告',async () => {
      const { stdout }=await promisify(execFile)(process.env.BACKEND_PYTHON || 'python3',['-m','tests.export_contract','--d2'],{ cwd:path.resolve('backend'),maxBuffer:2*1024*1024 });
      const output:unknown=JSON.parse(stdout);assert.ok(output && typeof output==='object' && 'snapshot' in output);
      const payload=decisionPayloadSchema.parse(output.snapshot);
      const first=await db.query<{ result:{ recordId:number;report:{ evaluation:{ items:{ value:number }[];isTest:boolean };baselineEvaluation:unknown } } }>('SELECT save_decision($1::jsonb) AS result',[JSON.stringify(payload)]);
      const second=await db.query('SELECT save_decision($1::jsonb) AS result',[JSON.stringify(payload)]);assert.deepEqual(first.rows,second.rows);
      const report=first.rows[0].result.report;
      assert.equal(report.evaluation.items[0].value,8);assert.equal(report.evaluation.items[1].value,6);assert.equal(report.evaluation.isTest,true);assert.ok(report.baselineEvaluation);
      const history=await db.query<{ score:number|null;evaluation_status:string }>('SELECT score,evaluation_status FROM scheme_history');assert.deepEqual(history.rows,[{ score:null,evaluation_status:'satisfied' }]);
      const before=(await db.query('SELECT content FROM scheme_report')).rows;
      await db.query("SELECT set_evaluation_criterion_enabled('test_settlement_limit',2,true)");
      assert.deepEqual((await db.query('SELECT content FROM scheme_report')).rows,before);
      const revision=await db.query<{ safety_snapshot:{ criteriaSnapshot:unknown[];response:{ inputDigest:string } } }>('SELECT safety_snapshot FROM decision_revision');
      assert.equal(revision.rows[0].safety_snapshot.criteriaSnapshot.length,2);assert.ok(revision.rows[0].safety_snapshot.response.inputDigest);
    });
  } finally { await db.close(); }
});
