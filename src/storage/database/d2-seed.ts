import type { SqlClient } from './migrate';
import { D2_CRITERIA } from '@/data/d2-fixtures';
export async function seedD2Fixtures(client:SqlClient):Promise<void> {
  await client.query('BEGIN');
  try {
    for (const criterion of D2_CRITERIA) await client.query('SELECT publish_evaluation_criterion($1::jsonb)',[JSON.stringify(criterion)]);
    await client.query('COMMIT');
  } catch(error:unknown) { await client.query('ROLLBACK');throw error; }
}
