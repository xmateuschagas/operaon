import { beforeEach,afterAll,it,expect,vi } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { testPool,resetDatabase } from './database.js';
import { authDeps,identity,leadInput,testConfig } from './fixtures.js';
import { sendReminder,reconcileReminders } from '../packages/shared/src/reminders.js';
import { WhatsAppClient,WhatsAppNotifier,type WhatsAppGateway } from '../packages/shared/src/whatsapp.js';
import type { JobQueue } from '../packages/shared/src/queue.js';
const pool=testPool();const now=new Date('2026-10-16T15:00:00Z');const notify=vi.fn();const app=buildApp(pool,{...authDeps,now:()=>now,notifier:{notify}});
const request=(url:string,cookie:string,method:'POST'|'PATCH'|'DELETE'='POST',payload?:Record<string,unknown>)=>app.inject({url,method,headers:{origin:testConfig.APP_URL,cookie},payload});
const send=vi.fn<WhatsAppGateway['send']>();const gateway:WhatsAppGateway={send};
beforeEach(async()=>{await resetDatabase(pool);send.mockReset().mockResolvedValue('provider-message');notify.mockReset();});afterAll(async()=>{await app.close();await pool.end();});
async function create(tenant?:string,start='2026-10-18T15:00:00Z'){
  const owner=await identity(pool,'OWNER',tenant);const lead=(await request('/leads',owner.cookie,'POST',{...leadInput(),whatsapp_opt_in:true})).json();
  const appointment=(await request('/appointments',owner.cookie,'POST',{lead_id:lead.id,titulo:'Conversa',start_time:start,end_time:new Date(new Date(start).getTime()+3600000).toISOString()})).json();
  const integration=(await request('/integrations/whatsapp',owner.cookie)).json();return {owner,lead,appointment,integration};
}
async function job(tenant:string,appointment:string,type='INSTANT_CONFIRMATION'){
  const row=(await pool.query('SELECT * FROM appointment_reminders WHERE appointment_id=$1 AND reminder_type=$2',[appointment,type])).rows[0]!;
  return {tenantId:tenant,reminderId:row.id,generation:row.generation,scheduledFor:row.scheduled_for.toISOString()};
}
const reply=(integration:{id:string;token:string},event:string,body:Record<string,unknown>)=>app.inject({url:`/webhooks/whatsapp/${integration.id}`,method:'POST',headers:{authorization:`Bearer ${integration.token}`,'x-event-id':event},payload:body});

// Banco real mantém unicidade e geração; o provedor é simulado para não enviar mensagens.
it('RN-08 cria apenas horários futuros e remarca nas mesmas linhas, cancelando vencidos',async()=>{
  const {owner,appointment}=await create();const before=(await pool.query('SELECT id FROM appointment_reminders ORDER BY id')).rows;
  expect(before).toHaveLength(3);
  await request(`/appointments/${appointment.id}`,owner.cookie,'PATCH',{start_time:'2026-10-16T15:30:00Z',end_time:'2026-10-16T16:30:00Z'});
  const after=(await pool.query('SELECT * FROM appointment_reminders ORDER BY id')).rows;expect(after.map(row=>({id:row.id}))).toEqual(before);expect(after.filter(row=>row.status==='CANCELLED')).toHaveLength(2);
  const second=await create(undefined,'2026-10-16T15:30:00Z');expect((await pool.query('SELECT * FROM appointment_reminders WHERE appointment_id=$1',[second.appointment.id])).rowCount).toBe(1);
});
it('RN-09/RN-23 revalida opt-in, invalida job antigo e não duplica após reiniciar',async()=>{
  const {owner,lead,appointment}=await create();const old=await job(owner.tenantId,appointment.id);
  await request(`/appointments/${appointment.id}`,owner.cookie,'PATCH',{start_time:'2026-10-19T15:00:00Z',end_time:'2026-10-19T16:00:00Z'});
  await sendReminder(pool,old,gateway,now);expect(send).not.toHaveBeenCalled();
  const current=await job(owner.tenantId,appointment.id);await sendReminder(pool,current,gateway,now);await sendReminder(pool,current,{send},now);expect(send).toHaveBeenCalledTimes(1);
  const later=await job(owner.tenantId,appointment.id,'REMINDER_1H');await pool.query('UPDATE leads SET whatsapp_opt_in=false WHERE id=$1',[lead.id]);await sendReminder(pool,later,gateway,new Date(later.scheduledFor));expect(send).toHaveBeenCalledTimes(1);
});
it('RN-08 reconcilia identificadores do adaptador e cancela jobs no cancelamento',async()=>{
  const {owner,appointment}=await create();const schedule=vi.fn<JobQueue['schedule']>().mockResolvedValue('opaque-provider-job');const cancel=vi.fn<JobQueue['cancel']>().mockResolvedValue();const queue:JobQueue={schedule,cancel,work:async()=>{}};
  await reconcileReminders(pool,queue,{tenantId:owner.tenantId,appointmentId:appointment.id});expect(schedule).toHaveBeenCalledTimes(3);expect((await pool.query('SELECT job_id FROM appointment_reminders')).rows.every(row=>row.job_id==='opaque-provider-job')).toBe(true);
  await request(`/appointments/${appointment.id}`,owner.cookie,'DELETE');await reconcileReminders(pool,queue,{tenantId:owner.tenantId,appointmentId:appointment.id});expect(cancel).toHaveBeenCalledTimes(3);expect(schedule).toHaveBeenCalledTimes(3);
});
it('retry salva erro sanitizado e reusa a chave idempotente; limite é compartilhado',async()=>{
  const {owner,appointment}=await create();const current=await job(owner.tenantId,appointment.id);send.mockRejectedValueOnce(new Error('segredo do provedor'));
  await expect(sendReminder(pool,current,gateway,now)).rejects.toThrow();expect((await pool.query('SELECT status,error_log FROM appointment_reminders WHERE id=$1',[current.reminderId])).rows[0]).toMatchObject({status:'FAILED',error_log:'WHATSAPP_DELIVERY_FAILED'});
  await sendReminder(pool,current,gateway,now);expect(send.mock.calls[0]?.[2]).toBe(send.mock.calls[1]?.[2]);
  const later=await job(owner.tenantId,appointment.id,'REMINDER_1H');const at=new Date(later.scheduledFor);await pool.query('INSERT INTO delivery_limits(tenant_id,window_start,count) VALUES($1,$2,30)',[owner.tenantId,at]);await expect(sendReminder(pool,later,gateway,at)).rejects.toThrow('WHATSAPP_RATE_LIMIT');expect(send).toHaveBeenCalledTimes(2);
});
it('RN-10/RN-23 confirma e remarca lead aberto uma vez; GANHO avisa sem reabrir funil',async()=>{
  const {owner,lead,appointment,integration}=await create();await sendReminder(pool,await job(owner.tenantId,appointment.id),gateway,now);
  const body={phone:lead.telefone_e164,reply_to:'provider-message',text:'1'};const confirmed=await reply(integration,'confirm',body);expect(confirmed.statusCode,confirmed.body).toBe(200);expect(confirmed.json().applied).toBe(true);
  expect((await pool.query('SELECT confirmacao_cliente FROM appointments')).rows[0].confirmacao_cliente).toBe('CONFIRMADO');
  await Promise.all([reply(integration,'reschedule',{...body,text:'2'}),reply(integration,'reschedule',{...body,text:'2'})]);
  const changed=(await pool.query('SELECT * FROM leads')).rows[0];expect(changed.data_proximo_passo.toISOString()).toBe(now.toISOString());expect(changed.descricao_proximo_passo).toBe('Remarcar: Conversa');
  await request(`/leads/${lead.id}`,owner.cookie,'PATCH',{etapa:'GANHO'});await reply(integration,'won',{...body,text:'2'});await reply(integration,'won',{...body,text:'2'});expect(notify).toHaveBeenCalledTimes(1);expect(notify.mock.calls[0]?.[0]).toMatchObject({kind:'reschedule',tenantId:owner.tenantId,userId:owner.userId});expect((await pool.query('SELECT etapa FROM leads')).rows[0].etapa).toBe('GANHO');
});
it('RN-09/RN-22 mesmo telefone em workspaces distintos não mistura opt-out ou confirmação',async()=>{
  const a=await create();const b=await create();await sendReminder(pool,await job(a.owner.tenantId,a.appointment.id),gateway,now);
  expect((await reply(b.integration,'cross',{phone:b.lead.telefone_e164,reply_to:'provider-message',text:'1'})).json().applied).toBe(false);
  await reply(a.integration,'stop',{phone:a.lead.telefone_e164,text:'SAIR'});expect((await pool.query('SELECT whatsapp_opt_in FROM leads WHERE id=$1',[a.lead.id])).rows[0].whatsapp_opt_in).toBe(false);expect((await pool.query('SELECT whatsapp_opt_in FROM leads WHERE id=$1',[b.lead.id])).rows[0].whatsapp_opt_in).toBe(true);
  expect((await app.inject({method:'POST',url:`/webhooks/whatsapp/${a.integration.id}`,headers:{authorization:`Bearer ${b.integration.token}`,'x-event-id':'invalid'},payload:{phone:a.lead.telefone_e164,text:'SAIR'}})).statusCode).toBe(401);
});
it('WhatsAppNotifier distingue aprovação global de destinatário local e adaptador preserva chave',async()=>{
  const localSend=vi.fn<WhatsAppGateway['send']>().mockResolvedValue('notice');const notifier=new WhatsAppNotifier({send:localSend},'5511111111111',{'member@example.invalid':'5522222222222'});
  await notifier.notify({kind:'approval',tenantId:crypto.randomUUID(),destination:'member@example.invalid',message:'Aprovar'});await notifier.notify({kind:'invitation',tenantId:crypto.randomUUID(),destination:'member@example.invalid',message:'Convite'});await notifier.notify({kind:'invitation',tenantId:crypto.randomUUID(),destination:'unknown',message:'Não enviar'});
  expect(localSend.mock.calls.map(call=>call[0])).toEqual(['5511111111111','5522222222222']);
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({id:'external'})));expect(await new WhatsAppClient('https://bridge.invalid','fixture','operaon',fetcher).send('5521999999999','Teste','stable-key')).toBe('external');expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({'idempotency-key':'stable-key'});
});
