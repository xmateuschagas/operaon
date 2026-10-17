import type { FastifyInstance,FastifyRequest } from 'fastify';
import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { uuidSchema } from '@operaon/shared';
import { enqueueJob } from '@operaon/shared/jobs';
import { planReminders } from '@operaon/shared/reminders';
import { DomainError } from '@operaon/shared/errors';
import { secured,type CrmDependencies } from './crm-routes.js';
import { findLead,audit,seesAll } from './leads.js';
import type { Actor } from './session.js';

const fields=z.object({lead_id:uuidSchema,titulo:z.string().trim().min(1).max(200),descricao:z.string().max(20000).nullable().optional(),local:z.string().max(255).nullable().optional(),start_time:z.string().datetime({offset:true}),end_time:z.string().datetime({offset:true})}).strict();
export const appointmentCreate=fields.refine((value)=>new Date(value.start_time)<new Date(value.end_time),'Início deve ser anterior ao fim');
export const appointmentUpdate=fields.omit({lead_id:true}).partial().extend({status:z.enum(['SCHEDULED','CONFIRMED','CANCELLED','COMPLETED']).optional()}).strict();
const idFrom=(request:FastifyRequest)=>z.object({id:uuidSchema}).parse(request.params).id;
export interface AppointmentRow {id:string;lead_id:string;user_id:string;start_time:Date;end_time:Date;status:string;[key:string]:unknown}
export async function findAppointment(db:PoolClient,actor:Actor,id:string) {
  const row=(await db.query<AppointmentRow>('SELECT * FROM appointments WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];if(!row)throw new DomainError('NOT_FOUND',404);
  await findLead(db,actor,row.lead_id,true);
  const current=(await db.query<AppointmentRow>('SELECT * FROM appointments WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];if(!current)throw new DomainError('NOT_FOUND',404);return current;
}
export function registerAgenda(app:FastifyInstance,pool:Pool,deps:CrmDependencies) {
  const route=(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,run:(db:PoolClient,actor:Actor,request:FastifyRequest)=>Promise<unknown>)=>secured(app,pool,deps,method,url,run);
  route('GET','/appointments',async(db,actor)=>{
    const result=await db.query('SELECT a.*,l.nome AS lead_nome FROM appointments a JOIN leads l ON l.id=a.lead_id WHERE a.deleted_at IS NULL AND l.deleted_at IS NULL AND (l.user_id=$1 OR $2) ORDER BY a.start_time',[actor.user_id,seesAll(actor)]);return result.rows;
  });
  route('POST','/appointments',async(db,actor,request)=>{
    const body=appointmentCreate.parse(request.body);const lead=await findLead(db,actor,body.lead_id,true);if(lead.etapa==='PERDIDO')throw new DomainError('INVALID_STATE',409,'Lead perdido não recebe novos compromissos');
    const row=(await db.query<AppointmentRow>('INSERT INTO appointments(tenant_id,user_id,lead_id,titulo,descricao,local,start_time,end_time) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[actor.active_tenant_id,actor.user_id,body.lead_id,body.titulo,body.descricao,body.local,body.start_time,body.end_time])).rows[0]!;
    await planReminders(db,actor.active_tenant_id!,row.id,deps.now?.()??new Date());await enqueueJob(db,actor.active_tenant_id!,'sync_google',{appointmentId:row.id});await audit(db,actor,'appointments',row.id,'CREATE');return row;
  });
  route('PATCH','/appointments/:id',async(db,actor,request)=>{
    const id=idFrom(request);const body=appointmentUpdate.parse(request.body);const previous=await findAppointment(db,actor,id);
    const lead=await findLead(db,actor,previous.lead_id);if(lead.etapa==='PERDIDO'&&(body.start_time||body.end_time||body.status==='SCHEDULED'||body.status==='CONFIRMED'))throw new DomainError('INVALID_STATE',409,'Lead perdido não pode ser reagendado');
    if(new Date(body.start_time??previous.start_time)>=new Date(body.end_time??previous.end_time))throw new DomainError('INVALID_TIME',400,'Início deve ser anterior ao fim');
    const entries=Object.entries(body).filter(([,value])=>value!==undefined);if(!entries.length)return previous;
    const row=(await db.query<AppointmentRow>(`UPDATE appointments SET ${entries.map(([key],index)=>`${key}=$${index+2}`).join(',')},sync_status='PENDING' WHERE id=$1 RETURNING *`,[id,...entries.map(([,value])=>value)])).rows[0]!;
    if(row.status==='CANCELLED')await db.query("UPDATE appointment_reminders SET status='CANCELLED' WHERE appointment_id=$1 AND status<>'SENT'",[id]);
    await planReminders(db,actor.active_tenant_id!,id,deps.now?.()??new Date());await enqueueJob(db,actor.active_tenant_id!,'sync_google',{appointmentId:id});await audit(db,actor,'appointments',id,'UPDATE');return row;
  });
  route('DELETE','/appointments/:id',async(db,actor,request)=>{
    const id=idFrom(request);await findAppointment(db,actor,id);await db.query("UPDATE appointments SET status='CANCELLED',deleted_at=$2,sync_status='PENDING' WHERE id=$1",[id,deps.now?.()??new Date()]);
    await planReminders(db,actor.active_tenant_id!,id,deps.now?.()??new Date());await enqueueJob(db,actor.active_tenant_id!,'sync_google',{appointmentId:id});await audit(db,actor,'appointments',id,'DELETE');return {ok:true};
  });
  route('POST','/appointments/:id/retry',async(db,actor,request)=>{const id=idFrom(request);await findAppointment(db,actor,id);await enqueueJob(db,actor.active_tenant_id!,'sync_google',{appointmentId:id});return {ok:true};});
}
