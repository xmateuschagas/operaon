import type { Pool } from 'pg';
import { withTenant } from './db/connection.js';
import { DomainError } from './errors.js';

// Transação própria confirma a contagem antes da operação de negócio, mesmo se ela falhar depois.
export async function takeWorkspaceQuota(pool:Pool,tenant:string,limit=300,now=new Date()) {
  const start=new Date(Math.floor(now.getTime()/60000)*60000);
  const accepted=await withTenant(pool,tenant,async(db)=>{
    await db.query("DELETE FROM request_limits WHERE window_start<$1::timestamptz-INTERVAL '2 days'",[now]);
    const result=await db.query('INSERT INTO request_limits(tenant_id,window_start,count) VALUES($1,$2,1) ON CONFLICT(tenant_id,window_start) DO UPDATE SET count=request_limits.count+1 WHERE request_limits.count<$3 RETURNING count',[tenant,start,limit]);return result.rowCount===1;
  });
  if(!accepted)throw new DomainError('WORKSPACE_RATE_LIMIT',429,'Limite de requisições do workspace atingido. Aguarde um momento',{retryAfter:Math.max(1,Math.ceil((start.getTime()+60000-now.getTime())/1000))});
}
