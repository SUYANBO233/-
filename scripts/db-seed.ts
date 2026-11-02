import { seedDatabase } from '../src/storage/database/seed';
import { withDatabase } from './database-env';

withDatabase(seedDatabase).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '种子初始化失败');
  process.exitCode = 1;
});
