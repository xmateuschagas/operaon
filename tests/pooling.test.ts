import { beforeAll,afterAll,it,expect } from 'vitest';
import { Pool } from 'pg';
import { testPool,resetDatabase } from './database.js';
import { withTenant } from '../packages/shared/src/db/connection.js';
import { identity } from './fixtures.js';
// Esta suíte adicional só usa PgBouncer local explicitamente configurado; migrations continuam na URL direta.
const url=process.env.POOLED_TEST_DATABASE_URL;const direct=testPool();const pooled=url?new Pool({connectionString:url,max:8}):undefined;let first:string;let second:string;
beforeAll(async()=>{if(!pooled)return;if(!new URL(url!).pathname.includes('test'))throw new Error('Pool exige banco de teste');await resetDatabase(direct);first=(await identity(direct)).tenantId;second=(await identity(direct)).tenantId;});
afterAll(async()=>{await pooled?.end();await direct.end();});
it.skipIf(!url)('RN-22 PgBouncer transaction reutiliza backend sem carregar tenant ou role entre transações',async()=>{
  const backend=new Set<number>();
  await Promise.all(Array.from({length:24},async(_value,index)=>{const tenant=index%2?first:second;await withTenant(pooled!,tenant,async(db)=>{const result=await db.query('SELECT id,pg_backend_pid() AS pid FROM tenants');expect(result.rows.map(row=>row.id)).toEqual([tenant]);backend.add(result.rows[0].pid);});}));
  expect(backend.size).toBe(1);
  const cleared=(await pooled!.query("SELECT NULLIF(current_setting('app.tenant_id',true),'') AS tenant,current_user AS role")).rows[0];expect(cleared.tenant).toBeNull();expect(cleared.role).not.toBe('operaon_app');
  await expect(withTenant(pooled!,first,async(db)=>{await db.query('SELECT 1');throw new Error('rollback intencional');})).rejects.toThrow('rollback');
  expect((await withTenant(pooled!,second,db=>db.query('SELECT id FROM tenants'))).rows.map(row=>row.id)).toEqual([second]);
});
