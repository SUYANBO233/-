import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export const migrationDirectory = path.resolve(process.cwd(), 'src/storage/database/migrations');

export async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationDirectory)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
}

export async function migrateDatabase(client: SqlClient): Promise<void> {
  await client.query("SELECT pg_advisory_lock(hashtext('tunnel_schema_migration'))");
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migration (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const name of await migrationFiles()) {
      const sql = await readFile(path.join(migrationDirectory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM public.schema_migration WHERE name = $1', [name]);
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`迁移 ${name} 已执行后被修改，请新增迁移文件`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migration(name,checksum) VALUES($1,$2)', [name, checksum]);
        await client.query('COMMIT');
        console.info(`已执行迁移 ${name}`);
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('tunnel_schema_migration'))");
  }
}
