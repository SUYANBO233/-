import { config } from 'dotenv';
import path from 'node:path';
import { Client } from 'pg';

export async function withDatabase(action: (client: Client) => Promise<void>): Promise<void> {
  config({ path: [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '.env')], quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('请在 .env.local 中配置 DATABASE_URL（PostgreSQL 连接地址）');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await action(client);
  } finally {
    await client.end();
  }
}
