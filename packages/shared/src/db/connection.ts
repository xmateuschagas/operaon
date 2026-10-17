import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { uuidSchema } from '../index.js';

// Role sem BYPASSRLS; o contexto expira no COMMIT/ROLLBACK e não vaza no pool.
export async function withTenant<T>(pool: Pool, tenantId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
  uuidSchema.parse(tenantId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE operaon_app');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Drizzle pode usar o mesmo client transacional protegido pelo RLS.
export const typedDatabase = (client: PoolClient) => drizzle(client);
