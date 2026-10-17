import { beforeEach,afterAll,it,expect,vi } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { testPool,resetDatabase } from './database.js';
import { authDeps,identity,leadInput,testConfig } from './fixtures.js';
import { encryptToken } from '../packages/shared/src/security.js';
import { GoogleFailure,GoogleCalendar,type CalendarGateway,type CalendarSession,type CalendarEvent } from '../packages/shared/src/google-calendar.js';
import { syncAppointment,bootstrapCalendar,googleEventId } from '../packages/shared/src/agenda-worker.js';
import { deliverOutbox } from '../packages/shared/src/jobs.js';
import type { JobQueue } from '../packages/shared/src/queue.js';
import { asApp } from '../apps/api/src/session.js';

const pool=testPool();const now=new Date('2026-10-16T15:00:00Z');const app=buildApp(pool,{...authDeps,now:()=>now});
const request=(url:string,cookie:string,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',payload?:Record<string,unknown>)=>app.inject({url,method,headers:{origin:testConfig.APP_URL,cookie},payload});
const eventInput=(lead:string)=>({lead_id:lead,titulo:'Diagnóstico',start_time:'2026-10-18T15:00:00Z',end_time:'2026-10-18T16:00:00Z'});
class FakeCalendar implements CalendarGateway,CalendarSession {
  calendars=new Map<string,string>();events=new Map<string,CalendarEvent>();tokens:string[]=[];fail=false;revoked=false;
  async connect(token:string){this.tokens.push(token);if(this.revoked)throw new GoogleFailure('REVOKED',400);return this;}
  async ensureCalendar(marker:string){if(!this.calendars.has(marker))this.calendars.set(marker,`secondary-${this.calendars.size+1}`);return this.calendars.get(marker)!;}
  async upsert(calendar:string,event:CalendarEvent){if(this.fail)throw new GoogleFailure('UNAVAILABLE',503);this.events.set(`${calendar}:${event.id}`,event);}
  async remove(calendar:string,id:string){this.events.delete(`${calendar}:${id}`);}
}
async function enable(userId:string){await pool.query('UPDATE users SET google_refresh_token_enc=$2,google_calendar_authorized=true WHERE id=$1',[userId,encryptToken('fixture-shared-refresh',testConfig.TOKEN_ENC_KEY)]);}
async function create(cookie:string,phone='5521999999999') {const lead=(await request('/leads',cookie,'POST',leadInput(phone))).json();const result=await request('/appointments',cookie,'POST',eventInput(lead.id));expect(result.statusCode).toBe(200);return {lead,appointment:result.json()};}
beforeEach(async()=>{await resetDatabase(pool);});afterAll(async()=>{await app.close();await pool.end();});

// Google simulado preserva efeitos externos mesmo se a transação local falhar, como no mundo real.
it('RN-11 salva PENDING apesar de falha e retry não duplica agenda/evento',async()=>{
  const owner=await identity(pool);await enable(owner.userId);const {appointment}=await create(owner.cookie);const gateway=new FakeCalendar();gateway.fail=true;
  expect(appointment.sync_status).toBe('PENDING');
  const payload={tenantId:owner.tenantId,appointmentId:appointment.id};
  await expect(syncAppointment(pool,payload,testConfig.TOKEN_ENC_KEY,gateway)).rejects.toThrow('UNAVAILABLE');
  expect((await pool.query('SELECT sync_status FROM appointments WHERE id=$1',[appointment.id])).rows[0].sync_status).toBe('PENDING');
  gateway.fail=false;await syncAppointment(pool,payload,testConfig.TOKEN_ENC_KEY,gateway);await syncAppointment(pool,payload,testConfig.TOKEN_ENC_KEY,gateway);
  expect(gateway.calendars.size).toBe(1);expect(gateway.events.size).toBe(1);
  expect((await pool.query('SELECT sync_status,google_event_id FROM appointments WHERE id=$1',[appointment.id])).rows[0]).toMatchObject({sync_status:'SYNCED',google_event_id:googleEventId(appointment.id)});
});
it('RN-13/RN-22 compromisso exige lead acessível e horário válido',async()=>{
  const owner=await identity(pool);const other=await identity(pool);const lead=(await request('/leads',owner.cookie,'POST',leadInput())).json();
  expect((await request('/appointments',owner.cookie,'POST',{...eventInput(lead.id),end_time:'2026-10-18T14:00:00Z'})).statusCode).toBe(400);
  expect((await request('/appointments',other.cookie,'POST',eventInput(lead.id))).statusCode).toBe(404);
  expect((await request('/appointments',owner.cookie,'POST',{titulo:'Sem lead'})).statusCode).toBe(400);
});
it('RN-20 uma conexão atende dois vínculos com agendas distintas e bootstrap idempotente',async()=>{
  const owner=await identity(pool);await enable(owner.userId);const gateway=new FakeCalendar();
  await Promise.all([bootstrapCalendar(pool,{tenantId:owner.tenantId,userId:owner.userId},testConfig.TOKEN_ENC_KEY,gateway),bootstrapCalendar(pool,{tenantId:owner.tenantId,userId:owner.userId},testConfig.TOKEN_ENC_KEY,gateway)]);
  const second=crypto.randomUUID();await pool.query("INSERT INTO tenants(id,nome,status) VALUES($1,'Segundo','ACTIVE')",[second]);await pool.query("INSERT INTO tenant_members(tenant_id,user_id,role,status) VALUES($1,$2,'OWNER','ACTIVE')",[second,owner.userId]);
  await bootstrapCalendar(pool,{tenantId:second,userId:owner.userId},testConfig.TOKEN_ENC_KEY,gateway);
  const calendars=(await pool.query('SELECT google_calendar_id FROM tenant_members WHERE user_id=$1',[owner.userId])).rows.map((row)=>row.google_calendar_id);
  expect(new Set(calendars).size).toBe(2);expect(gateway.calendars.size).toBe(2);expect(new Set(gateway.tokens)).toEqual(new Set(['fixture-shared-refresh']));expect((await pool.query('SELECT * FROM users')).rowCount).toBe(1);
});
it('editar e excluir enviam estado atual ao Google e removem evento dedicado',async()=>{
  const owner=await identity(pool);await enable(owner.userId);const {appointment}=await create(owner.cookie);const gateway=new FakeCalendar();const payload={tenantId:owner.tenantId,appointmentId:appointment.id};
  await syncAppointment(pool,payload,testConfig.TOKEN_ENC_KEY,gateway);
  expect((await request(`/appointments/${appointment.id}`,owner.cookie,'PATCH',{titulo:'Remarcado',start_time:'2026-10-19T15:00:00Z',end_time:'2026-10-19T16:00:00Z'})).statusCode).toBe(200);
  await syncAppointment(pool,payload,testConfig.TOKEN_ENC_KEY,gateway);expect([...gateway.events.values()][0]?.summary).toBe('Remarcado');
  expect((await request(`/appointments/${appointment.id}`,owner.cookie,'DELETE')).statusCode).toBe(200);
  await syncAppointment(pool,payload,testConfig.TOKEN_ENC_KEY,gateway);expect(gateway.events.size).toBe(0);
});
it('RN-16 perder/excluir cancela futuros e lembretes; GANHO mantém',async()=>{
  const owner=await identity(pool);const lost=await create(owner.cookie);const won=await create(owner.cookie,'5521888888888');const removed=await create(owner.cookie,'5521777777777');
  await pool.query("INSERT INTO appointment_reminders(tenant_id,appointment_id,reminder_type,scheduled_for) VALUES($1,$2,'REMINDER_1H','2026-10-18T14:00:00Z')",[owner.tenantId,lost.appointment.id]);
  expect((await request(`/leads/${lost.lead.id}`,owner.cookie,'PATCH',{etapa:'PERDIDO',motivo_perda:'PRECO'})).statusCode).toBe(200);
  await request(`/leads/${won.lead.id}`,owner.cookie,'PATCH',{etapa:'GANHO'});await request(`/leads/${removed.lead.id}`,owner.cookie,'DELETE');
  const statuses=(await pool.query('SELECT id,status FROM appointments')).rows;expect(statuses.find((row)=>row.id===lost.appointment.id)?.status).toBe('CANCELLED');expect(statuses.find((row)=>row.id===removed.appointment.id)?.status).toBe('CANCELLED');expect(statuses.find((row)=>row.id===won.appointment.id)?.status).toBe('SCHEDULED');
  expect((await pool.query('SELECT status FROM appointment_reminders')).rows[0].status).toBe('CANCELLED');
});
it('refresh revogado marca reautorização global e mantém compromisso',async()=>{
  const owner=await identity(pool);await enable(owner.userId);const {appointment}=await create(owner.cookie);const gateway=new FakeCalendar();gateway.revoked=true;
  await expect(syncAppointment(pool,{tenantId:owner.tenantId,appointmentId:appointment.id},testConfig.TOKEN_ENC_KEY,gateway)).rejects.toThrow('REVOKED');
  expect((await request('/session',owner.cookie)).json().google.reauth_required).toBe(true);expect((await pool.query('SELECT * FROM appointments')).rowCount).toBe(1);
});
it('outbox entrega uma vez por linha e descoberta é negada à role da API',async()=>{
  const owner=await identity(pool);await create(owner.cookie);const schedule=vi.fn<JobQueue['schedule']>().mockResolvedValue('fake-job-id');const queue:JobQueue={schedule,cancel:async()=>{},work:async()=>{}};
  await deliverOutbox(pool,queue);await deliverOutbox(pool,queue);expect(schedule).toHaveBeenCalledTimes(1);expect(schedule.mock.calls[0]?.[1]).toMatchObject({tenantId:owner.tenantId});
  await expect(asApp(pool,testConfig,db=>db.query('SELECT operaon_outbox_tenants()'))).rejects.toMatchObject({code:'42501'});
});
it('adaptador real nunca escreve na agenda principal e trata 404/409 no upsert',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({access_token:'fixture'})));
  const client=await new GoogleCalendar('fixture','fixture',fetcher).connect('fixture');
  const event:CalendarEvent={id:'abc123',summary:'Teste',start:{dateTime:now.toISOString(),timeZone:'UTC'},end:{dateTime:new Date(now.getTime()+1000).toISOString(),timeZone:'UTC'}};
  await expect(client.upsert('primary',event)).rejects.toThrow('principal');expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response('',{status:409})).mockResolvedValueOnce(new Response('{}',{status:200}));
  await client.upsert('dedicated',event);expect(fetcher).toHaveBeenCalledTimes(4);
});
