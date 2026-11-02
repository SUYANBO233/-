import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { migrateDatabase, migrationDirectory, type SqlClient } from '../src/storage/database/migrate';
import { seedDatabase } from '../src/storage/database/seed';
import * as schema from '../src/storage/database/shared/schema';
import { DEFAULT_GEO_PARAMS_IV } from '../src/data/decision';
import { decisionPayloadSchema } from '../src/lib/validation/decision-response';
import { saveDecisionSchema } from '../src/lib/validation/decision';
import { chainageToMeters } from '../src/lib/measurements';

function clientFor(db: PGlite): SqlClient {
  return { query: async (sql, values) => {
    if (values) return db.query<Record<string, unknown>>(sql, values);
    const results = await db.exec(sql);
    return { rows: (results[results.length - 1]?.rows ?? []) as Record<string, unknown>[] };
  } };
}

function payload() {
  const fixture: unknown = JSON.parse(readFileSync(path.resolve(process.cwd(), 'tests/fixtures/decision-payload.json'), 'utf8'));
  return { ...decisionPayloadSchema.parse(fixture), requestKey: randomUUID() };
}

test('13 表迁移、初始化及事务保存', async (t) => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    await db.exec('CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated;');
    await t.test('全新数据库可迁移；Drizzle 列定义与 SQL 一致；再次执行不重复', async () => {
      await migrateDatabase(client);
      await migrateDatabase(client);
      const tables = Object.entries(schema).filter(([name]) => name !== 'healthCheck');
      assert.equal(tables.length, 13);
      for (const [, table] of tables) {
        const config = getTableConfig(table);
        const result = await db.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', ['public', config.name]);
        assert.deepEqual(result.rows.map((row) => row.column_name).sort(), config.columns.map((column) => column.name).sort(), config.name);
      }
      const migrations = await db.query('SELECT * FROM schema_migration');
      assert.equal(migrations.rows.length, 3);
    });
    await t.test('初始化幂等；保留用户修改；种子主键不影响后续新增', async () => {
      await seedDatabase(client);
      await db.query("UPDATE equipment SET model='已调整型号' WHERE seed_key='equipment:1'");
      await seedDatabase(client);
      for (const [table, count] of [['equipment',9],['knowledge_mapping',8],['support_scheme',7],['construction_method',3],['scheme_history',23],['workface',2]] as const) {
        const result = await db.query<{ count: number }>(`SELECT count(*)::int as count FROM ${table}`);
        assert.equal(result.rows[0].count, count, table);
      }
      const equipment = await db.query<{ model: string }>("SELECT model FROM equipment WHERE seed_key='equipment:1'");
      assert.equal(equipment.rows[0].model, '已调整型号');
      await db.query("INSERT INTO equipment(name,model,pos,stage) VALUES('新增','新型号','现场','开挖')");
      await db.query("INSERT INTO knowledge_mapping(code,hard,intact,water,depth,stress,rock,scheme) VALUES('NEW','硬','完整','干燥','浅','低','IV','S4a')");
    });
    await t.test('原子保存报告、台账及多个调整版本；相同请求重试不重复', async () => {
      const data = payload();
      data.revisions.push({ ...data.revisions[0], reason: '人工调整' });
      const first = await db.query<{ result: { recordId: number; report: { no: string } } }>('SELECT save_decision($1::jsonb) AS result', [JSON.stringify(data)]);
      const second = await db.query('SELECT save_decision($1::jsonb) AS result', [JSON.stringify(data)]);
      assert.deepEqual(second.rows, first.rows);
      assert.ok(first.rows[0].result.report.no.startsWith('SY1-SC-'));
      const count = await db.query<{ revisions: number; reports: number }>('SELECT (SELECT count(*)::int FROM decision_revision) AS revisions,(SELECT count(*)::int FROM scheme_report) AS reports');
      assert.deepEqual(count.rows[0], { revisions: 2, reports: 1 });
      const methodSnapshot = await db.query<{ method_snapshot: { catalog: { code: string }; algorithmCandidate: { key: string } } }>('SELECT method_snapshot FROM decision_revision LIMIT 1');
      assert.equal(methodSnapshot.rows[0].method_snapshot.catalog.code, 'bench');
      assert.equal(methodSnapshot.rows[0].method_snapshot.algorithmCandidate.key, 'bench');
      const changed = { ...data, mode: 'joint' };
      await assert.rejects(db.query('SELECT save_decision($1::jsonb)', [JSON.stringify(changed)]), /different decision/);
      await db.query("UPDATE support_scheme SET steel='修改模板' WHERE seed_key='support:1'");
      const third = await db.query('SELECT save_decision($1::jsonb) AS result', [JSON.stringify(data)]);
      assert.deepEqual(third.rows, first.rows);
    });
    await t.test('事务中途失败时不留决策任务、版本或报告', async () => {
      const data = payload();
      const invalid = { ...data, revisions: [...data.revisions, { ...data.revisions[0], methodKey: 'unknown' }] };
      await assert.rejects(db.query('SELECT save_decision($1::jsonb)', [JSON.stringify(invalid)]));
      const result = await db.query('SELECT * FROM decision_run WHERE request_key=$1', [data.requestKey]);
      assert.equal(result.rows.length, 0);
    });
    await t.test('外键拒绝悬空关联；采集记录必须区分来源', async () => {
      await assert.rejects(db.query("INSERT INTO workface(tunnel_id,code,name) VALUES(999999,'bad','不存在的洞线')"));
      await assert.rejects(db.query("INSERT INTO geo_observation(workface_id,chainage_m,observed_at,rock_grade,params) VALUES(1,3601200,now(),'IV','{}')"));
    });
    await t.test('匿名角色不能调用保存函数；服务端角色可以访问新表', async () => {
      const rights = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
        "SELECT has_function_privilege('anon','save_decision(jsonb)','EXECUTE') AS anon,has_function_privilege('authenticated','save_decision(jsonb)','EXECUTE') AS authenticated,has_function_privilege('service_role','save_decision(jsonb)','EXECUTE') AS service");
      assert.deepEqual(rights.rows[0], { anon: false, authenticated: false, service: true });
      await db.exec('SET ROLE service_role');
      const methods = await db.query('SELECT id FROM construction_method');
      assert.equal(methods.rows.length, 3);
      await db.exec('RESET ROLE');
    });
  } finally { await db.close(); }
});

test('旧版四表升级保留记录并修复显式主键导致的序列冲突', async () => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    const sql = await readFile(path.join(migrationDirectory, '001_core.sql'), 'utf8');
    await db.exec(sql.slice(0, sql.indexOf('ALTER TABLE public.equipment')));
    await db.query("INSERT INTO equipment(id,name,model,pos,stage,is_custom) VALUES(1,'旧设备','旧型号','现场','开挖',true)");
    await migrateDatabase(client);
    await seedDatabase(client);
    const old = await db.query<{ name: string }>('SELECT name FROM equipment WHERE id=1');
    assert.equal(old.rows[0].name, '旧设备');
    const added = await db.query<{ id: number }>("INSERT INTO equipment(name,model,pos,stage) VALUES('新设备','新型号','现场','开挖') RETURNING id");
    assert.ok(added.rows[0].id > 9);
  } finally { await db.close(); }
});

test('输入校验拒绝伪造工法、零间距和无效请求；桩号换算保留小数', () => {
  const valid = { requestKey: randomUUID(), mode: 'manual', workface: 'shayi_main', mileage: 'K3601+200', params: DEFAULT_GEO_PARAMS_IV,
    revisions: [{ methodKey: 'bench', reason: '初始方案', values: { steel: 80, shot: 22, anchor: 3, advance: 40 } }] };
  assert.ok(saveDecisionSchema.safeParse(valid).success);
  assert.equal(saveDecisionSchema.safeParse({ ...valid, revisions: [] }).success, false);
  assert.equal(saveDecisionSchema.safeParse({ ...valid, revisions: [{ ...valid.revisions[0], methodKey: 'fake' }] }).success, false);
  assert.equal(saveDecisionSchema.safeParse({ ...valid, revisions: [{ ...valid.revisions[0], values: { ...valid.revisions[0].values, steel: 0 } }] }).success, false);
  assert.equal(chainageToMeters('K3600+651.30'), 3600651.3);
  assert.throws(() => chainageToMeters('K3600+1000'));
});
