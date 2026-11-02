import { migrationFiles, migrateDatabase } from '../src/storage/database/migrate';
import { withDatabase } from './database-env';

async function main(): Promise<void> {
  if (process.argv.includes('--plan')) {
    for (const name of await migrationFiles()) console.info(name);
    console.info('仅列出迁移文件，未连接数据库；数据库会记录已执行文件及校验和。');
    return;
  }
  await withDatabase(migrateDatabase);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '数据库迁移失败');
  process.exitCode = 1;
});
