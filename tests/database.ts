import { Pool } from 'pg';
import { migrate } from '../packages/shared/src/db/migrate.js';

// Destruição permitida apenas em banco de teste explicitamente configurado e identificado.
export function testPool() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.includes('test')) throw new Error('Defina TEST_DATABASE_URL apontando para banco com test no nome');
  return new Pool({ connectionString: url, max: 4 });
}
export async function resetDatabase(pool: Pool) {
  await migrate(pool);
  await pool.query('TRUNCATE tenants,users CASCADE');
}
