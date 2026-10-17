import { createHash } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { uuidSchema } from './index.js';
import { decryptToken } from './security.js';
import { withTenant } from './db/connection.js';
import { DomainError } from './errors.js';
import { GoogleFailure,type CalendarGateway,type CalendarSession } from './google-calendar.js';
import type { JobQueue } from './queue.js';

interface Appointment {id:string;user_id:string;titulo:string;descricao:string|null;local:string|null;start_time:Date;end_time:Date;status:string;deleted_at:Date|null;google_event_id:string|null}
const bootstrap=z.object({tenantId:uuidSchema,userId:uuidSchema});
const sync=z.object({tenantId:uuidSchema,appointmentId:uuidSchema});
export const googleEventId=(id:string)=>createHash('sha256').update(id).digest('hex');

async function connection(db:PoolClient,userId:string,key:string,gateway:CalendarGateway) {
  await db.query('SELECT operaon_lock_google_member($1)',[userId]);
  const value=(await db.query<{ciphertext:string|null;authorized:boolean;reauth_required:boolean}>('SELECT * FROM operaon_google_connection($1)',[userId])).rows[0];
  if(!value?.ciphertext||!value.authorized||value.reauth_required)throw new DomainError('GOOGLE_REAUTH_REQUIRED',409,'Autorize a agenda Google');
  return gateway.connect(decryptToken(value.ciphertext,key));
}
async function calendar(db:PoolClient,tenantId:string,userId:string,session:CalendarSession) {
  const member=(await db.query<{google_calendar_id:string|null}>('SELECT google_calendar_id FROM tenant_members WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
  if(!member)throw new DomainError('ACCESS_REVOKED',403);
  if(member.google_calendar_id==='primary')throw new Error('Agenda principal não permitida');
  if(member.google_calendar_id)return member.google_calendar_id;
  const tenant=(await db.query<{nome:string;timezone:string}>('SELECT nome,timezone FROM tenants WHERE id=$1',[tenantId])).rows[0]!;
  const id=await session.ensureCalendar(`OperaON:${tenantId}:${userId}`,`OperaON · ${tenant.nome}`,tenant.timezone);
  if(id==='primary')throw new Error('Agenda principal não permitida');
  await db.query('UPDATE tenant_members SET google_calendar_id=$2 WHERE user_id=$1',[userId,id]);return id;
}

// Estado local atual é lido sob lock; jobs antigos não podem desfazer remarcações/cancelamentos novos.
export async function syncAppointment(pool:Pool,payload:unknown,key:string,gateway:CalendarGateway) {
  const job=sync.parse(payload);let userId:string|undefined;
  try {await withTenant(pool,job.tenantId,async(db)=>{
    const preview=(await db.query<Appointment>('SELECT * FROM appointments WHERE id=$1',[job.appointmentId])).rows[0];if(!preview)return;userId=preview.user_id;
    await db.query('SELECT operaon_lock_google_member($1)',[userId]);
    const item=(await db.query<Appointment>('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[job.appointmentId])).rows[0];if(!item)return;
    if(item.user_id!==userId)throw new Error('Responsável alterado durante sincronização');
    const stored=(await db.query<{google_calendar_id:string|null}>('SELECT google_calendar_id FROM tenant_members WHERE user_id=$1',[item.user_id])).rows[0];
    const cancelled=item.status==='CANCELLED'||item.deleted_at!==null;
    if(cancelled&&!stored?.google_calendar_id){await db.query("UPDATE appointments SET sync_status='SYNCED' WHERE id=$1",[item.id]);return;}
    const session=await connection(db,item.user_id,key,gateway);const calendarId=await calendar(db,job.tenantId,item.user_id,session);const eventId=item.google_event_id??googleEventId(item.id);
    if(cancelled)await session.remove(calendarId,eventId);
    else {
      const timezone=(await db.query<{timezone:string}>('SELECT timezone FROM tenants')).rows[0]!.timezone;
      await session.upsert(calendarId,{id:eventId,summary:item.titulo,description:item.descricao??undefined,location:item.local??undefined,start:{dateTime:item.start_time.toISOString(),timeZone:timezone},end:{dateTime:item.end_time.toISOString(),timeZone:timezone}});
    }
    await db.query("UPDATE appointments SET google_event_id=$2,sync_status='SYNCED' WHERE id=$1",[item.id,eventId]);
  });}catch(error){
    // Falha externa não desfaz o compromisso já salvo; erro de revogação afeta a conexão global.
    await withTenant(pool,job.tenantId,async(db)=>{await db.query("UPDATE appointments SET sync_status='PENDING' WHERE id=$1",[job.appointmentId]);if(userId&&error instanceof GoogleFailure&&error.reason==='REVOKED')await db.query('SELECT operaon_google_revoked($1)',[userId]);});throw error;
  }
}
export async function bootstrapCalendar(pool:Pool,payload:unknown,key:string,gateway:CalendarGateway) {
  const job=bootstrap.parse(payload);
  try {await withTenant(pool,job.tenantId,async(db)=>{const session=await connection(db,job.userId,key,gateway);await calendar(db,job.tenantId,job.userId,session);});}
  catch(error){if(error instanceof GoogleFailure&&error.reason==='REVOKED')await withTenant(pool,job.tenantId,(db)=>db.query('SELECT operaon_google_revoked($1)',[job.userId]));throw error;}
}
export async function registerAgendaJobs(queue:JobQueue,pool:Pool,key:string,gateway:CalendarGateway) {
  await queue.work('sync_google',(payload)=>syncAppointment(pool,payload,key,gateway));
  await queue.work('calendar_bootstrap',(payload)=>bootstrapCalendar(pool,payload,key,gateway));
}
