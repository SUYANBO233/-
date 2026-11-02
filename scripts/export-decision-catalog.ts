import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CONSTRUCTION_METHODS, DECISION_META, buildSupportComponents } from '../src/data/decision';

async function main(): Promise<void> {
  const directory = path.resolve(process.cwd(), 'backend/data');
  await mkdir(directory, { recursive: true });
  const catalog = { methods: CONSTRUCTION_METHODS, meta: DECISION_META,
    supportByGrade: { IV: buildSupportComponents('IV'), V: buildSupportComponents('V') } };
  await writeFile(path.join(directory, 'decision.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  console.info('已从现有前端参考数据导出 Python 算法目录。');
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
