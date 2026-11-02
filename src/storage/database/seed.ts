import { knowledgeData } from '../../data/knowledge';
import { overviewData } from '../../data/overview';
import { schemeHistoryData } from '../../data/scheme';
import { CONSTRUCTION_METHODS, DECISION_META } from '../../data/decision';
import { advanceToMeters, chainageToMeters, durationToMinutes, supportParameters } from '../../lib/measurements';
import type { SqlClient } from './migrate';

type Values = Record<string, unknown>;
const identifier = (value: string): string => {
  if (!/^[a-z_]+$/.test(value)) throw new Error('无效的内部 SQL 标识符');
  return `"${value}"`;
};

async function seedRow(client: SqlClient, table: string, keyColumn: string, values: Values, legacyMatch?: Values): Promise<number> {
  const tableName = `public.${identifier(table)}`;
  // 接管旧版种子记录，只添加来源键；不覆盖已有内容，也不删除重复的历史记录。
  if (legacyMatch) {
    const fields = Object.entries(legacyMatch);
    const where = fields.map(([key], i) => `${identifier(key)} = $${i + 2}`).join(' AND ');
    await client.query(`UPDATE ${tableName} SET seed_key=$1,source='seed' WHERE id = (
      SELECT id FROM ${tableName} WHERE seed_key IS NULL AND ${where} ORDER BY id LIMIT 1
    ) AND NOT EXISTS (SELECT 1 FROM ${tableName} WHERE seed_key=$1)`,
    [values.seed_key, ...fields.map(([, value]) => value)]);
  }
  const entries = Object.entries(values);
  await client.query(`INSERT INTO ${tableName} (${entries.map(([key]) => identifier(key)).join(',')})
    VALUES (${entries.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (${identifier(keyColumn)}) DO NOTHING`,
  entries.map(([, value]) => value));
  const result = await client.query(`SELECT id FROM ${tableName} WHERE ${identifier(keyColumn)}=$1`, [values[keyColumn]]);
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error(`初始化 ${table} 失败`);
  return id;
}

export async function seedDatabase(client: SqlClient): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('tunnel_seed_v1'))");
    // 与旧版 API 写入互斥，避免同步 serial 序列期间发生并发编号冲突。
    await client.query('LOCK TABLE public.equipment,public.knowledge_mapping,public.support_scheme,public.scheme_history IN SHARE ROW EXCLUSIVE MODE');
    const projectId = await seedRow(client, 'project', 'code', {
      code: 'shayi_1', name: '沙益1号示范工程', status: 'active',
    });
    const methodIds = new Map<string, number>();
    for (const [i, method] of CONSTRUCTION_METHODS.entries()) {
      const card = knowledgeData.methods[i];
      const id = await seedRow(client, 'construction_method', 'code', {
        code: method.key, name: method.name, geology: card.geology, section: card.section,
        advantage: card.advantage, equipment_text: card.equipment,
        rock_grades: JSON.stringify(method.key === 'full' ? ['I', 'II', 'III'] : method.key === 'bench' ? ['IV'] : ['V','VI']),
        cycle_hours: Number.parseFloat(method.cycle), advance_m: Number.parseFloat(method.adv),
        shotcrete_thickness_mm: Number.parseFloat(method.shot) * 10,
        monthly_advance_m: Number.parseFloat(method.month), description: method.desc, tone: card.tone, source: 'seed',
      });
      methodIds.set(method.key, id);
    }
    const schemeIds = new Map<string, number>();
    for (const s of knowledgeData.schemes) {
      const id = await seedRow(client, 'support_scheme', 'seed_key', {
        seed_key: `support:${s.no}`, no: s.no, rock: s.rock, type: s.type, depth: s.depth,
        adv_type: s.advType, adv_ring: s.advRing, adv_len: s.advLen, adv_scope: s.advScope,
        anchor: s.anchor, steel: s.steel, shot: s.shot, conc: s.conc, thick: s.thick,
        mode: s.mode, adv_rate: s.advRate, bench_len: s.benchLen, is_custom: false, source: 'seed',
        parameters: JSON.stringify(supportParameters(s)),
      }, { no: s.no, type: s.type, is_custom: false });
      schemeIds.set(s.type, id);
    }
    const workfaceIds = new Map<string, number>();
    for (const kind of ['main','pilot'] as const) {
      const view = overviewData.tunnel[kind];
      const tunnelId = await seedRow(client, 'tunnel', 'code', {
        code: `shayi_${kind}`, project_id: projectId, name: view.title, kind,
        start_chainage_m: chainageToMeters(view.segments[0].start),
        end_chainage_m: chainageToMeters(view.segments[view.segments.length - 1].end), length_m: view.totalLen,
      });
      const option = DECISION_META.workfaces.find((item) => item.value === `shayi_${kind}`);
      if (!option) throw new Error('缺少工作面种子');
      const workfaceId = await seedRow(client, 'workface', 'code', { tunnel_id: tunnelId, code: option.value, name: option.label });
      workfaceIds.set(option.label, workfaceId);
      for (const segment of view.segments) {
        const methodKey = segment.method.includes('台阶') ? 'bench' : segment.method.includes('环形') ? 'core' : null;
        await seedRow(client, 'tunnel_segment', 'seed_key', {
          seed_key: `${kind}:segment:${segment.id}`, tunnel_id: tunnelId,
          start_chainage_m: chainageToMeters(segment.start), end_chainage_m: chainageToMeters(segment.end),
          length_m: segment.len, method_id: methodKey ? methodIds.get(methodKey) : null,
          support_scheme_id: schemeIds.get(segment.type) ?? null, snapshot: JSON.stringify(segment), source: 'seed',
        });
      }
    }
    for (const eq of knowledgeData.equipment) {
      const { id, ...fields } = eq;
      await seedRow(client, 'equipment', 'seed_key', { ...fields, seed_key: `equipment:${id}`, is_custom: false, source: 'seed' },
        { name: eq.name, model: eq.model, is_custom: false });
    }
    for (const mapping of knowledgeData.mappings) {
      await seedRow(client, 'knowledge_mapping', 'seed_key', { ...mapping, seed_key: `mapping:${mapping.code}`, is_custom: false, source: 'seed' },
        { code: mapping.code, is_custom: false });
    }
    for (const r of schemeHistoryData.records) {
      await seedRow(client, 'scheme_history', 'seed_key', {
        seed_key: `history:${r.id}`, time: r.time, face: r.face, start_mile: r.startMile, end_mile: r.endMile,
        advance: r.advance, rock: r.rock, method: r.method, type: r.type, score: r.score, detail: r.detail,
        custom: false, source: 'seed', advance_m: advanceToMeters(r.advance), cycle_duration_minutes: durationToMinutes(r.detail),
        workface_id: workfaceIds.get(r.face) ?? null, method_id: methodIds.get(r.method.includes('台阶') ? 'bench' : r.method.includes('全断面') ? 'full' : 'core'),
      }, { time: r.time, face: r.face, start_mile: r.startMile, end_mile: r.endMile, custom: false });
    }
    // 显式插入过编号的旧数据库也可安全新增，不重用已有主键或展示序号。
    for (const [table, column] of [['equipment','id'],['knowledge_mapping','id'],['support_scheme','id'],['scheme_history','id'],['knowledge_mapping','no'],['support_scheme','no']]) {
      const result = await client.query('SELECT pg_get_serial_sequence($1,$2) AS name', [table, column]);
      const name = result.rows[0]?.name;
      if (typeof name !== 'string' || !/^public\.[a-z_]+$/.test(name)) throw new Error(`无法同步 ${table}.${column} 序列`);
      await client.query(`SELECT setval($1::regclass,GREATEST(COALESCE(max(${identifier(column)}),0),
        (SELECT last_value FROM ${name}),1),(SELECT is_called FROM ${name}) OR count(*)>0)
        FROM public.${identifier(table)}`, [name]);
    }
    await client.query('COMMIT');
    console.info('种子初始化完成；已有记录保持不变。未伪造实测地质数据或真实决策结果。');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}
