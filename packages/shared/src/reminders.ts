import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { uuidSchema } from './index.js';
import { withTenant } from './db/connection.js';
import { enqueueJob } from './jobs.js';
import type { JobQueue } from './queue.js';
import type { WhatsAppGateway } from './whatsapp.js';

interface Reminder {id:string;appointment_id:string;reminder_type:string;scheduled_for:Date;generation:number;job_id:string|null;status:string}
interface Appointment {id:string;lead_id:string;titulo:string;start_time:Date;status:string;deleted_at:Date|null}
const appointmentJob=z.object({tenantId:uuidSchema,appointmentId:uuidSchema});
const sendJob=z.object({tenantId:uuidSchema,reminderId:uuidSchema,generation:z.number().int(),scheduledFor:z.string().datetime()});
export const reminderKey=(tenant:string,appointment:string,type:string,time:Date)=>`rem:${tenant}:${appointment}:${type}:${time.getTime()}`;

// Chamado na transação do compromisso. Atualiza as mesmas linhas e invalida qualquer geração em voo.
export async function planReminders(db:PoolClient,tenantId:string,appointmentId:string,now:Date) {
  const appointment=(await db.query<Appointment>('SELECT * FROM appointments WHERE id=$1',[appointmentId])).rows[0];if(!appointment)return;
  if(appointment.status==='CANCELLED'||appointment.status==='COMPLETED'||appointment.deleted_at)await db.query("UPDATE appointment_reminders SET status='CANCELLED',generation=generation+1 WHERE appointment_id=$1 AND status<>'SENT'",[appointmentId]);
  else for(const [type,time] of [['INSTANT_CONFIRMATION',now],['REMINDER_24H',new Date(appointment.start_time.getTime()-86400000)],['REMINDER_1H',new Date(appointment.start_time.getTime()-3600000)]] as const) {
    const previous=(await db.query<Reminder>('SELECT * FROM appointment_reminders WHERE appointment_id=$1 AND reminder_type=$2 FOR UPDATE',[appointmentId,type])).rows[0];
    if(previous)await db.query("UPDATE appointment_reminders SET scheduled_for=$2,status=$3,generation=generation+1,sent_at=NULL,message_id=NULL,error_log=NULL WHERE id=$1",[previous.id,time,time<now?'CANCELLED':'PENDING']);
    else if(time>=now)await db.query('INSERT INTO appointment_reminders(tenant_id,appointment_id,reminder_type,scheduled_for) VALUES($1,$2,$3,$4)',[tenantId,appointmentId,type,time]);
  }
  await enqueueJob(db,tenantId,'reconcile_reminders',{appointmentId});
}

// Cancelamento do job é uma otimização; geração e status no banco são a barreira de segurança real.
export async function reconcileReminders(pool:Pool,queue:JobQueue,payload:unknown) {
  const job=appointmentJob.parse(payload);
  await withTenant(pool,job.tenantId,async(db)=>{
    const rows=await db.query<Reminder>('SELECT * FROM appointment_reminders WHERE appointment_id=$1 ORDER BY id FOR UPDATE',[job.appointmentId]);
    for(const reminder of rows.rows){
      if(reminder.job_id)await queue.cancel('send_reminder',reminder.job_id);
      const id=reminder.status==='PENDING'?await queue.schedule('send_reminder',{tenantId:job.tenantId,reminderId:reminder.id,generation:reminder.generation,scheduledFor:reminder.scheduled_for.toISOString()},{key:reminderKey(job.tenantId,job.appointmentId,reminder.reminder_type,reminder.scheduled_for),at:reminder.scheduled_for}):null;
      await db.query('UPDATE appointment_reminders SET job_id=$2 WHERE id=$1',[reminder.id,id]);
    }
  });
}

// Locks seguem lead -> compromisso -> lembrete, também usados pelo webhook e pelas rotas de alteração.
export async function sendReminder(pool:Pool,payload:unknown,gateway:WhatsAppGateway,now=new Date()) {
  const job=sendJob.parse(payload);let attempted=false;
  try {await withTenant(pool,job.tenantId,async(db)=>{
    const preview=(await db.query<{appointment_id:string;lead_id:string;user_id:string}>('SELECT r.appointment_id,a.lead_id,a.user_id FROM appointment_reminders r JOIN appointments a ON a.id=r.appointment_id WHERE r.id=$1',[job.reminderId])).rows[0];if(!preview)return;
    await db.query('SELECT operaon_lock_member($1)',[preview.user_id]);
    const active=await db.query("SELECT id FROM tenants WHERE status='ACTIVE' FOR SHARE");if(!active.rowCount)return;
    const lead=(await db.query<{telefone_e164:string;whatsapp_opt_in:boolean;deleted_at:Date|null;etapa:string}>('SELECT * FROM leads WHERE id=$1 FOR UPDATE',[preview.lead_id])).rows[0]!;
    const appointment=(await db.query<Appointment>('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[preview.appointment_id])).rows[0]!;
    const reminder=(await db.query<Reminder>('SELECT * FROM appointment_reminders WHERE id=$1 FOR UPDATE',[job.reminderId])).rows[0]!;
    if(reminder.generation!==job.generation||reminder.scheduled_for.toISOString()!==job.scheduledFor||!['PENDING','FAILED'].includes(reminder.status))return;
    if(reminder.scheduled_for>now)throw new Error('REMINDER_NOT_DUE');
    if(!lead.whatsapp_opt_in||lead.deleted_at||lead.etapa==='PERDIDO'||appointment.deleted_at||!['SCHEDULED','CONFIRMED'].includes(appointment.status)||appointment.start_time<=now){await db.query("UPDATE appointment_reminders SET status='CANCELLED' WHERE id=$1",[reminder.id]);return;}
    // Contador transacional compartilhado limita o agregado das réplicas.
    const window=new Date(Math.floor(now.getTime()/60000)*60000);
    await db.query("DELETE FROM delivery_limits WHERE window_start<$1::timestamptz-INTERVAL '2 days'",[now]);
    const count=(await db.query<{count:number}>('INSERT INTO delivery_limits(tenant_id,window_start,count) VALUES($1,$2,1) ON CONFLICT(tenant_id,window_start) DO UPDATE SET count=delivery_limits.count+1 RETURNING count',[job.tenantId,window])).rows[0]!.count;
    if(count>30)throw new Error('WHATSAPP_RATE_LIMIT');
    attempted=true;const timezone=(await db.query<{timezone:string}>('SELECT timezone FROM tenants')).rows[0]!.timezone;
    const text=`${appointment.titulo}: ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:timezone}).format(appointment.start_time)}. Responda 1 para confirmar, 2 para remarcar ou SAIR para não receber mensagens.`;
    const message=await gateway.send(lead.telefone_e164,text,`${reminderKey(job.tenantId,appointment.id,reminder.reminder_type,reminder.scheduled_for)}:${reminder.generation}`);
    await db.query("UPDATE appointment_reminders SET status='SENT',message_id=$2,sent_at=$3,error_log=NULL WHERE id=$1",[reminder.id,message,now]);
  });}catch(error){
    // Salvar erro fora da transação revertida permite diagnóstico sem registrar dados do provedor.
    if(attempted||error instanceof Error&&error.message==='WHATSAPP_RATE_LIMIT')await withTenant(pool,job.tenantId,(db)=>db.query("UPDATE appointment_reminders SET status='FAILED',error_log=$3 WHERE id=$1 AND generation=$2 AND status IN ('PENDING','FAILED')",[job.reminderId,job.generation,attempted?'WHATSAPP_DELIVERY_FAILED':'WHATSAPP_RATE_LIMIT']));throw error;
  }
}
export async function registerReminderJobs(queue:JobQueue,pool:Pool,gateway:WhatsAppGateway) {
  await queue.work('reconcile_reminders',(payload)=>reconcileReminders(pool,queue,payload));
  await queue.work('send_reminder',(payload)=>sendReminder(pool,payload,gateway));
}

// No boot, aplicar D26 antes de registrar consumidores: não disparar lembretes antigos acumulados.
export async function recoverReminders(pool:Pool,now=new Date()) {
  const discovery=await pool.connect();let tenants:string[];
  try {
    await discovery.query('BEGIN');await discovery.query('SET LOCAL ROLE operaon_worker');
    tenants=(await discovery.query<{id:string}>('SELECT operaon_reminder_tenants() AS id')).rows.map(row=>row.id);
    await discovery.query('COMMIT');
  }catch(error){await discovery.query('ROLLBACK');throw error;}finally{discovery.release();}
  for(const tenantId of tenants)await withTenant(pool,tenantId,async(db)=>{
    const appointments=await db.query<{id:string;start_time:Date;status:string;deleted_at:Date|null}>("SELECT a.* FROM appointments a WHERE EXISTS(SELECT 1 FROM appointment_reminders r WHERE r.appointment_id=a.id AND r.status='PENDING') ORDER BY a.id FOR UPDATE OF a");
    for(const item of appointments.rows){
      // Mesma ordem compromisso -> lembrete das mutações; geração invalida jobs já persistidos.
      await db.query("UPDATE appointment_reminders SET status='CANCELLED',generation=generation+1,error_log='vencido durante indisponibilidade' WHERE appointment_id=$1 AND status='PENDING' AND (scheduled_for<$2 AND reminder_type<>'INSTANT_CONFIRMATION' OR $3::timestamptz<=$2 OR $4 OR $5)",[item.id,now,item.start_time,item.deleted_at!==null,!['SCHEDULED','CONFIRMED'].includes(item.status)]);
      await enqueueJob(db,tenantId,'reconcile_reminders',{appointmentId:item.id});
    }
  });
}
