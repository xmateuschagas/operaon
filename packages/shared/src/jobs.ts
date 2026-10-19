import type { Pool,PoolClient } from 'pg';
import { withTenant } from './db/connection.js';
import type { JobQueue } from './queue.js';

// Chave estável por evento da outbox; reentrega pode ocorrer e handlers precisam ser idempotentes.
export async function enqueueJob(db:PoolClient,tenantId:string,kind:string,payload:Record<string,unknown>,key:string=crypto.randomUUID(),at?:Date) {
  await db.query('INSERT INTO domain_jobs(tenant_id,kind,payload,dedupe_key,available_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,dedupe_key) DO NOTHING',[tenantId,kind,JSON.stringify(payload),key,at]);
}
// Uma edição ou retry manual inicia nova geração; jobs anteriores não podem encerrar a nova tentativa.
export async function requestGoogleSync(db:PoolClient,tenantId:string,appointmentId:string) {
  const row=(await db.query<{sync_generation:number}>("UPDATE appointments SET sync_status='PENDING',sync_generation=sync_generation+1,sync_attempts=0,sync_started_at=NULL,sync_next_attempt_at=NULL WHERE id=$1 RETURNING sync_generation",[appointmentId])).rows[0];
  if(row)await enqueueJob(db,tenantId,'sync_google',{appointmentId,generation:row.sync_generation});
}
export async function deliverOutbox(pool:Pool,queue:JobQueue) {
  const client=await pool.connect();let tenants:string[];
  try {await client.query('BEGIN');await client.query('SET LOCAL ROLE operaon_worker');tenants=(await client.query<{id:string}>('SELECT operaon_outbox_tenants() AS id')).rows.map((row)=>row.id);await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  for(const tenant of tenants)await withTenant(pool,tenant,async(db)=>{
    // SKIP LOCKED permite várias réplicas do dispatcher sem entregar a mesma linha simultaneamente.
    const jobs=await db.query<{id:string;kind:string;payload:Record<string,unknown>;dedupe_key:string;available_at:Date|null}>('SELECT * FROM domain_jobs WHERE delivered_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20');
    // Falhas Google tratadas viram nova outbox; retry do broker fica reservado a falhas de infraestrutura.
    for(const job of jobs.rows){await queue.schedule(job.kind,{...job.payload,tenantId:tenant},{key:job.dedupe_key,at:job.available_at??undefined});await db.query('UPDATE domain_jobs SET delivered_at=NOW() WHERE id=$1',[job.id]);}
  });
}
