import { config } from 'dotenv';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { D1_CATALOG_FIXTURE } from '../src/data/d1-fixtures';
import { seedD1Fixtures } from '../src/storage/database/d1-seed';
import { getLocalTestDatabase, sqlClient } from '../src/server/catalog-store';

export async function prepareD1Fixtures(): Promise<void> {
  process.env.DECISION_DATA_SOURCE = 'local-test';
  const db = await getLocalTestDatabase();
  try { await seedD1Fixtures(sqlClient(db)); }
  finally { await db.close(); }
}
async function main() {
  config({ path:[path.resolve('.env.local'),path.resolve('.env')],quiet:true });
  if (process.argv.includes('--export')) {
    await writeFile(path.resolve('tests/fixtures/d1-catalog.json'),JSON.stringify(D1_CATALOG_FIXTURE,null,2)+'\n');
    console.info('已导出固定版本的临时测试场景；未连接业务数据库。');
  } else {
    await prepareD1Fixtures();
    console.info('已初始化隔离的本地 D1 测试资料；没有写入 Supabase。');
  }
}
if (process.argv[1]?.endsWith('d1-fixtures.ts')) void main().catch((error: unknown) => { console.error(error);process.exitCode=1; });
