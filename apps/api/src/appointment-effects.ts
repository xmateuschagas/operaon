import type { PoolClient } from 'pg';
import { enqueueJob } from '@operaon/shared/jobs';
import { planReminders } from '@operaon/shared/reminders';

// RN-16 é executada dentro da transação que exclui/perde o lead, incluindo cancelamento de lembretes.
export async function cancelFutureAppointments(db:PoolClient,tenantId:string,leadId:string,userId:string,now:Date) {
  const items=await db.query<{id:string}>("UPDATE appointments SET status='CANCELLED',sync_status='PENDING' WHERE lead_id=$1 AND start_time>$2 AND status IN ('SCHEDULED','CONFIRMED') AND deleted_at IS NULL RETURNING id",[leadId,now]);
  for(const item of items.rows){
    await db.query("UPDATE appointment_reminders SET status='CANCELLED' WHERE appointment_id=$1 AND status<>'SENT'",[item.id]);
    await planReminders(db,tenantId,item.id,now);
    await enqueueJob(db,tenantId,'sync_google',{appointmentId:item.id});
    await db.query("INSERT INTO audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES($1,$2,'appointments',$3,'CANCEL_LEAD')",[tenantId,userId,item.id]);
  }
}
