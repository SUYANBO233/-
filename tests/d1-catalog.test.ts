import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { catalogImportSchema, conditionSchema, structuredSupportSchema } from '../src/lib/decision-catalog';
import { D1_FIXTURES } from '../src/data/d1-fixtures';
import { seedD1Fixtures } from '../src/storage/database/d1-seed';
import { migrateDatabase } from '../src/storage/database/migrate';
import { sqlClient } from '../src/server/catalog-store';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { decisionPayloadSchema } from '../src/lib/validation/decision-response';

test('D1 可执行资料：真实 SQL、版本、导入与完整性',async (t) => {
  const db=new PGlite();
  try {
    await db.exec('CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon;');
    await migrateDatabase(sqlClient(db));
    await t.test('同一合成批次重复导入不覆盖手动启停，不产生重复记录',async () => {
      await seedD1Fixtures(sqlClient(db));
      await db.query("SELECT set_decision_catalog_enabled('rule','test_method_iv',1,false)");
      await seedD1Fixtures(sqlClient(db));
      const rules=await db.query<{ count:number }>('SELECT count(*)::integer AS count FROM decision_rule');
      assert.equal(rules.rows[0].count,D1_FIXTURES.rules.length);
      const status=await db.query<{ enabled:boolean }>("SELECT enabled FROM decision_rule WHERE code='test_method_iv'");
      assert.equal(status.rows[0].enabled,false);
      const observations=await db.query<{ count:number }>('SELECT count(*)::integer AS count FROM geo_observation');
      assert.equal(observations.rows[0].count,D1_FIXTURES.observations.length);
      await db.query("SELECT set_decision_catalog_enabled('rule','test_method_iv',1,true)");
    });
    await t.test('同一编码版本内容不可覆盖；新版本启用后替代旧版本',async () => {
      const rule=structuredClone(D1_FIXTURES.rules[1]);
      await assert.rejects(db.query('SELECT publish_decision_catalog($1::jsonb)',[JSON.stringify(catalogImportSchema.parse({ formatVersion:1,rules:[{ ...rule,reason:'不能覆盖既有版本' }] }))]),/different content/);
      rule.version=2;rule.reason='新版本条件';rule.conditions.all.push({ field:'depth',op:'range',min:700,minInclusive:true,maxInclusive:false });
      const bundle=catalogImportSchema.parse({ formatVersion:1,rules:[rule] });
      await db.query('SELECT publish_decision_catalog($1::jsonb)',[JSON.stringify(bundle)]);
      const enabled=await db.query<{ version:number }>("SELECT version FROM decision_rule WHERE code='test_method_iv' AND enabled");
      assert.deepEqual(enabled.rows,[{ version:2 }]);
      await db.query("SELECT set_decision_catalog_enabled('rule','test_method_iv',1,true)");
      const reverted=await db.query<{ version:number }>("SELECT version FROM decision_rule WHERE code='test_method_iv' AND enabled");
      assert.deepEqual(reverted.rows,[{ version:1 }]);
    });
    await t.test('外键错误使整批模板和规则一起回滚',async () => {
      const template={ ...D1_FIXTURES.templates[0],code:'test_rollback_template' };
      const rule={ ...D1_FIXTURES.rules[4],code:'test_rollback_rule',templateCode:'nonexistent' };
      const bundle=catalogImportSchema.parse({ formatVersion:1,templates:[template],rules:[rule] });
      await assert.rejects(db.query('SELECT publish_decision_catalog($1::jsonb)',[JSON.stringify(bundle)]),/foreign key/);
      assert.equal((await db.query("SELECT id FROM support_scheme WHERE code='test_rollback_template'")).rows.length,0);
    });
    await t.test('条件字段、区间与构件规格校验，不允许假完整数据入库',() => {
      assert.equal(conditionSchema.safeParse({ field:'unknown',op:'eq',value:'IV' }).success,false);
      assert.equal(conditionSchema.safeParse({ field:'depth',op:'range',min:5,max:1 }).success,false);
      assert.equal(conditionSchema.safeParse({ field:'density',op:'eq',value:'2550' }).success,false);
      const p=structuredClone(D1_FIXTURES.templates[0].parameters);
      assert.equal(structuredSupportSchema.safeParse({ ...p,anchor:{ type:'只有描述' } }).success,false);
      assert.equal(catalogImportSchema.safeParse({ formatVersion:1,templates:[{ ...D1_FIXTURES.templates[0],parameters:{ ...p,advance:{ ...p.advance,diameterMm:0 } } }] }).success,false);
    });
    await t.test('匿名角色无权发布资料或切换启用版本',async () => {
      const rights=await db.query<{ publish:boolean;enable:boolean }>("SELECT has_function_privilege('anon','publish_decision_catalog(jsonb)','EXECUTE') AS publish,has_function_privilege('anon','set_decision_catalog_enabled(text,text,integer,boolean)','EXECUTE') AS enable");
      assert.deepEqual(rights.rows,[{ publish:false,enable:false }]);
      const read=await db.query<{ allowed:boolean }>("SELECT has_function_privilege('anon','read_decision_catalog()','EXECUTE') AS allowed");
      assert.equal(read.rows[0].allowed,false);
    });
    await t.test('未知评价允许空分数，新增快照列保留版本资料',async () => {
      const columns=await db.query<{ is_nullable:string }>("SELECT is_nullable FROM information_schema.columns WHERE table_name='scheme_history' AND column_name='score'");
      assert.equal(columns.rows[0].is_nullable,'YES');
      const versions=await db.query("SELECT template_snapshot,rules_snapshot FROM decision_revision");
      assert.equal(versions.rows.length,0);
    });
    await t.test('真实 Python D1 快照落库后保留完整规格、规则与无评分状态',async () => {
      const { stdout }=await promisify(execFile)(process.env.BACKEND_PYTHON || 'python3',['-m','tests.export_contract','--d1'],{ cwd:path.resolve('backend'),maxBuffer:2*1024*1024 });
      const output:unknown=JSON.parse(stdout);
      assert.ok(output && typeof output === 'object' && 'snapshot' in output);
      const snapshot=decisionPayloadSchema.parse(output.snapshot);
      const first=await db.query('SELECT save_decision($1::jsonb) AS result',[JSON.stringify(snapshot)]);
      const second=await db.query('SELECT save_decision($1::jsonb) AS result',[JSON.stringify(snapshot)]);
      assert.deepEqual(first.rows,second.rows);
      const saved=await db.query<{ template_snapshot:typeof snapshot.revisions[0]['template'];rules_snapshot:unknown[] }>('SELECT template_snapshot,rules_snapshot FROM decision_revision');
      assert.equal(saved.rows[0].template_snapshot?.parameters.anchor.diameterMm,22);
      assert.equal(saved.rows[0].rules_snapshot.length,D1_FIXTURES.rules.length);
      const history=await db.query<{ score:number | null;evaluation_status:string }>('SELECT score,evaluation_status FROM scheme_history');
      assert.deepEqual(history.rows,[{ score:null,evaluation_status:'unavailable' }]);
      const original=JSON.stringify(saved.rows);
      await db.query("UPDATE support_scheme SET parameters=jsonb_set(parameters,'{anchor,lengthM}','9') WHERE code='test_iv_main'");
      assert.equal(JSON.stringify((await db.query('SELECT template_snapshot,rules_snapshot FROM decision_revision')).rows),original);
    });
    await t.test('删除保留仍被引用的决策；最后一条删除清理快照且保留资料',async () => {
      const before=(await db.query('SELECT read_decision_catalog() AS catalog')).rows;
      const original=(await db.query<{ id:number }>('SELECT id FROM scheme_history')).rows[0].id;
      const duplicate=await db.query<{ id:number }>(`INSERT INTO scheme_history(time,face,start_mile,end_mile,advance,rock,method,type,score,detail,decision_run_id,scheme_report_id)
        SELECT time,face,start_mile,end_mile,advance,rock,method,type,score,detail,decision_run_id,NULL FROM scheme_history WHERE id=$1 RETURNING id`,[original]);
      assert.equal((await db.query<{ count:number }>('SELECT delete_scheme_history($1::integer[]) AS count',[[original]])).rows[0].count,1);
      assert.equal((await db.query('SELECT id FROM scheme_report')).rows.length,0);
      assert.equal((await db.query('SELECT id FROM decision_run')).rows.length,1);
      await db.query('SELECT delete_scheme_history($1::integer[])',[[duplicate.rows[0].id]]);
      for (const table of ['scheme_history','scheme_report','decision_revision','decision_run']) {
        assert.equal((await db.query(`SELECT id FROM ${table}`)).rows.length,0);
      }
      assert.deepEqual((await db.query('SELECT read_decision_catalog() AS catalog')).rows,before);
      assert.equal((await db.query<{ count:number }>('SELECT delete_scheme_history($1::integer[]) AS count',[[original]])).rows[0].count,0);
      assert.equal((await db.query<{ allowed:boolean }>("SELECT has_function_privilege('anon','delete_scheme_history(integer[])','EXECUTE') AS allowed")).rows[0].allowed,false);
    });
  } finally { await db.close(); }
});
