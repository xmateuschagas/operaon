import type { Pool,PoolClient } from 'pg';
import { withTenant } from './db/connection.js';
import type { JobQueue } from './queue.js';

// Chave estável por evento da outbox; reentrega pode ocorrer e handlers precisam ser idempotentes.
export async function enqueueJob(db:PoolClient,tenantId:string,kind:string,payload:Record<string,unknown>,key=crypto.randomUUID()) {
  await db.query('INSERT INTO domain_jobs(tenant_id,kind,payload,dedupe_key) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,dedupe_key) DO NOTHING',[tenantId,kind,JSON.stringify(payload),key]);
}
export async function deliverOutbox(pool:Pool,queue:JobQueue) {
  const client=await pool.connect();let tenants:string[];
  try {await client.query('BEGIN');await client.query('SET LOCAL ROLE operaon_worker');tenants=(await client.query<{id:string}>('SELECT operaon_outbox_tenants() AS id')).rows.map((row)=>row.id);await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  for(const tenant of tenants)await withTenant(pool,tenant,async(db)=>{
    // SKIP LOCKED permite várias réplicas do dispatcher sem entregar a mesma linha simultaneamente.
    const jobs=await db.query<{id:string;kind:string;payload:Record<string,unknown>;dedupe_key:string}>('SELECT * FROM domain_jobs WHERE delivered_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20');
    for(const job of jobs.rows){await queue.schedule(job.kind,{...job.payload,tenantId:tenant},{key:job.dedupe_key});await db.query('UPDATE domain_jobs SET delivered_at=NOW() WHERE id=$1',[job.id]);}
  });
}
