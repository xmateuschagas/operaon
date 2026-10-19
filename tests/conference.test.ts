import { beforeEach,afterAll,it,expect,vi } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { testPool,resetDatabase } from './database.js';
import { authDeps,identity,leadInput,testConfig } from './fixtures.js';
import { withTenant } from '../packages/shared/src/db/connection.js';
import { asApp } from '../apps/api/src/session.js';
import { recoverReminders,reconcileReminders,sendReminder } from '../packages/shared/src/reminders.js';
import { encryptToken } from '../packages/shared/src/security.js';
import { syncAppointment } from '../packages/shared/src/agenda-worker.js';
import { deliverOutbox } from '../packages/shared/src/jobs.js';
import { GoogleFailure,type CalendarGateway } from '../packages/shared/src/google-calendar.js';
import type { JobQueue } from '../packages/shared/src/queue.js';

const pool=testPool();const now=new Date('2026-10-18T15:00:00Z');
const app=buildApp(pool,{...authDeps,now:()=>now});
const request=(url:string,cookie:string,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',payload?:Record<string,unknown>)=>app.inject({url,method,headers:{origin:testConfig.APP_URL,cookie},payload});
beforeEach(async()=>resetDatabase(pool));afterAll(async()=>{await app.close();await pool.end();});
async function appointment(){
  const owner=await identity(pool);const lead=(await request('/leads',owner.cookie,'POST',{...leadInput(),whatsapp_opt_in:true})).json();
  const item=(await request('/appointments',owner.cookie,'POST',{lead_id:lead.id,titulo:'Conferência',start_time:'2026-10-20T15:00:00Z',end_time:'2026-10-20T16:00:00Z'})).json();
  return {owner,lead,item};
}

// D8 usa o instante atual, inclusive vencimentos no mesmo dia; D21 prevalece sobre o fuso fixo antigo.
it('D8/RN-22 separa atraso, instante atual, meia-noite local e limite dos sete dias',async()=>{
  const owner=await identity(pool);
  const times=['2026-10-18T14:59:59.999Z',now.toISOString(),'2026-10-19T02:59:59.999Z','2026-10-19T03:00:00Z','2026-10-26T02:59:59.999Z','2026-10-26T03:00:00Z'];
  for(const [i,date] of times.entries())await request('/leads',owner.cookie,'POST',{...leadInput(`552199999990${i}`),data_proximo_passo:date});
  const result=(await request('/queue',owner.cookie)).json();expect(result.counts).toEqual({atrasados:1,hoje:2,proximos:2});expect(result.items).toHaveLength(5);
  await pool.query("UPDATE tenants SET timezone='Asia/Tokyo' WHERE id=$1",[owner.tenantId]);
  expect((await request('/queue',owner.cookie)).json().counts).toEqual({atrasados:1,hoje:3,proximos:2});
});
it('D2/D17/RN-06/RN-07 formulário deduplica eventos distintos concorrentes sem atualizar',async()=>{
  const owner=await identity(pool);const integration=(await request('/integrations/form',owner.cookie,'POST',{})).json();
  const call=(event:string,nome='Original')=>app.inject({method:'POST',url:`/webhooks/leads/${integration.id}`,headers:{authorization:`Bearer ${integration.token}`,'x-event-id':event},payload:{nome,telefone_e164:'5521999999999',necessidade_resumo:''}});
  const results=await Promise.all([call('one'),call('two')]);expect(results.map(r=>r.statusCode).sort()).toEqual([200,201]);expect(results[0]!.json().id).toBe(results[1]!.json().id);
  await pool.query("UPDATE tenant_members SET status='BLOCKED'");
  expect((await call('three','Não alterar')).statusCode).toBe(200);
  expect((await pool.query('SELECT nome,necessidade_resumo,whatsapp_opt_in FROM leads')).rows).toEqual([{nome:'Original',necessidade_resumo:'Não informada',whatsapp_opt_in:false}]);
});
it('D5/D6/D18 CSV aceita só opt-in explícito e preserva duplicados',async()=>{
  const owner=await identity(pool);const csv='nome,telefone,opt_in\nSim,5521999999991,sim\nNão,5521999999992,false\nAusente,5521999999993,\nInválido,5521999999994,talvez';
  const result=(await request('/imports',owner.cookie,'POST',{csv})).json();expect(result).toMatchObject({created:3,errors:1});
  expect((await pool.query('SELECT whatsapp_opt_in FROM leads ORDER BY telefone_e164')).rows.map(row=>row.whatsapp_opt_in)).toEqual([true,false,false]);
  expect((await request('/imports',owner.cookie,'POST',{csv:'nome,telefone,opt_in\nAlterado,5521999999991,false'})).json()).toMatchObject({created:0,duplicates:1});
  const lead=(await pool.query("SELECT * FROM leads WHERE telefone_e164='5521999999991'")).rows[0];expect(lead).toMatchObject({nome:'Sim',etapa:'NOVO',whatsapp_opt_in:true,descricao_proximo_passo:'Primeiro contato'});expect(lead.data_proximo_passo).toEqual(new Date(now.getTime()+3600000));
});
it('D21 TZ_DEFAULT inicializa workspace sem sobrescrever seu fuso depois',async()=>{
  const local=buildApp(pool,{...authDeps,config:{...testConfig,TZ_DEFAULT:'Asia/Tokyo'}});
  try {
    const owner=await identity(pool);const result=await local.inject({method:'POST',url:'/workspaces',headers:{origin:testConfig.APP_URL,cookie:owner.cookie},payload:{nome:'Novo fuso'}});
    expect(result.statusCode,result.body).toBe(200);
    expect((await pool.query('SELECT timezone FROM tenants WHERE id=$1',[result.json().id])).rows[0].timezone).toBe('Asia/Tokyo');
    expect((await pool.query('SELECT timezone FROM tenants WHERE id=$1',[owner.tenantId])).rows[0].timezone).toBe('America/Sao_Paulo');
  }finally{await local.close();}
});
it('D22/RN-12 trigger impede UPDATE e DELETE pelo proprietário além das permissões de runtime',async()=>{
  const {owner,lead}=await appointment();
  const payload={canal:'Ligação',resumo:'Registro permanente',etapa:'NOVO',data_proximo_passo:'2026-10-21T15:00:00Z',descricao_proximo_passo:'Retornar'};
  expect((await request(`/leads/${lead.id}/interactions`,owner.cookie,'POST',payload)).statusCode).toBe(200);
  for(const sql of ["UPDATE lead_interactions SET resumo='Outra versão'",'DELETE FROM lead_interactions'])await expect(pool.query(sql)).rejects.toMatchObject({code:'55000'});
  await expect(withTenant(pool,owner.tenantId,db=>db.query('DELETE FROM lead_interactions'))).rejects.toMatchObject({code:'42501'});
  expect((await pool.query('SELECT resumo FROM lead_interactions')).rows[0].resumo).toBe('Registro permanente');
});
it('D14/D26/RN-08 boot cancela vencidos e recupera futuros, preservando confirmação imediata futura',async()=>{
  const {owner,item}=await appointment();
  const rows=(await pool.query('SELECT * FROM appointment_reminders WHERE appointment_id=$1',[item.id])).rows;
  await pool.query("UPDATE appointment_reminders SET scheduled_for=$2,job_id='old-broker-id' WHERE appointment_id=$1",[item.id,new Date(now.getTime()-60000)]);
  await expect(asApp(pool,testConfig,db=>db.query('SELECT operaon_reminder_tenants()'))).rejects.toMatchObject({code:'42501'});
  await recoverReminders(pool,now);
  const reminders=(await pool.query('SELECT * FROM appointment_reminders WHERE appointment_id=$1',[item.id])).rows;
  expect(reminders.filter(r=>r.status==='CANCELLED')).toHaveLength(2);expect(reminders.filter(r=>r.status==='CANCELLED').every(r=>r.error_log==='vencido durante indisponibilidade')).toBe(true);
  expect(reminders.find(r=>r.reminder_type==='INSTANT_CONFIRMATION').status).toBe('PENDING');
  const schedule=vi.fn<JobQueue['schedule']>().mockResolvedValue('recovered');const queue:JobQueue={schedule,cancel:vi.fn(),work:async()=>{}};
  await reconcileReminders(pool,queue,{tenantId:owner.tenantId,appointmentId:item.id});expect(schedule).toHaveBeenCalledTimes(1);
  const send=vi.fn().mockResolvedValue('sent');const stale=rows.find(r=>r.reminder_type==='REMINDER_1H');
  await sendReminder(pool,{tenantId:owner.tenantId,reminderId:stale.id,generation:stale.generation,scheduledFor:stale.scheduled_for.toISOString()},{send},now);expect(send).not.toHaveBeenCalled();
  // Segunda inicialização restaura o futuro sem gerar linhas novas; compromisso passado perde a exceção.
  await recoverReminders(pool,new Date('2026-10-21T15:00:00Z'));expect((await pool.query('SELECT status FROM appointment_reminders')).rows.every(r=>r.status==='CANCELLED')).toBe(true);
});
it('D14 recria jobs de PENDING futuros mesmo quando a outbox anterior já foi entregue',async()=>{
  const {owner,item}=await appointment();await pool.query('UPDATE domain_jobs SET delivered_at=NOW()');
  await recoverReminders(pool,now);const queue:JobQueue={schedule:vi.fn().mockResolvedValue('recovered'),cancel:vi.fn(),work:async()=>{}};
  await deliverOutbox(pool,queue);expect(queue.schedule).toHaveBeenCalledWith('reconcile_reminders',{tenantId:owner.tenantId,appointmentId:item.id},expect.anything());
  await reconcileReminders(pool,queue,{tenantId:owner.tenantId,appointmentId:item.id});expect(queue.schedule).toHaveBeenCalledTimes(4);
});

// Fake externo, estado de retry e deduplicação em Postgres real, sem esperar 24h no teste.
it('D11/RN-11 persiste backoff exato, encerra em 24h e retry manual invalida geração antiga',async()=>{
  const {owner,item}=await appointment();await pool.query('UPDATE users SET google_refresh_token_enc=$2,google_calendar_authorized=true WHERE id=$1',[owner.userId,encryptToken('fixture',testConfig.TOKEN_ENC_KEY)]);
  const connect=vi.fn<CalendarGateway['connect']>().mockRejectedValue(new GoogleFailure('UNAVAILABLE',503));
  let at=now;
  for(const [i,seconds] of [60,300,900,3600,21600,21600].entries()){
    await syncAppointment(pool,{tenantId:owner.tenantId,appointmentId:item.id,generation:1,attempt:i},testConfig.TOKEN_ENC_KEY,{connect},at,false);
    const state=(await pool.query('SELECT * FROM appointments WHERE id=$1',[item.id])).rows[0];expect(state.sync_status).toBe('PENDING');expect(state.sync_next_attempt_at.getTime()-at.getTime()).toBe(seconds*1000);at=state.sync_next_attempt_at;
  }
  const schedule=vi.fn<JobQueue['schedule']>().mockResolvedValue('delivered');await deliverOutbox(pool,{schedule,cancel:async()=>{},work:async()=>{}});
  expect(schedule.mock.calls.filter(call=>call[0]==='sync_google'&&call[2].at).length).toBe(6);
  const calls=connect.mock.calls.length;
  await syncAppointment(pool,{tenantId:owner.tenantId,appointmentId:item.id,generation:1,attempt:6},testConfig.TOKEN_ENC_KEY,{connect},new Date(now.getTime()+86400000),false);
  expect(connect).toHaveBeenCalledTimes(calls);expect((await pool.query('SELECT sync_status FROM appointments')).rows[0].sync_status).toBe('ERROR');
  await request(`/appointments/${item.id}/retry`,owner.cookie,'POST');
  await syncAppointment(pool,{tenantId:owner.tenantId,appointmentId:item.id,generation:1},testConfig.TOKEN_ENC_KEY,{connect},at,false);
  expect(connect).toHaveBeenCalledTimes(calls);expect((await pool.query('SELECT sync_status,sync_generation,sync_attempts FROM appointments')).rows[0]).toMatchObject({sync_status:'PENDING',sync_generation:2,sync_attempts:0});
});
it('D12 token revogado mantém PENDING mesmo depois de 24h',async()=>{
  const {owner,item}=await appointment();await pool.query('UPDATE users SET google_refresh_token_enc=$2,google_calendar_authorized=true WHERE id=$1',[owner.userId,encryptToken('fixture',testConfig.TOKEN_ENC_KEY)]);
  const connect=vi.fn<CalendarGateway['connect']>().mockRejectedValue(new GoogleFailure('REVOKED',400));
  await syncAppointment(pool,{tenantId:owner.tenantId,appointmentId:item.id,generation:1},testConfig.TOKEN_ENC_KEY,{connect},now,false);
  await syncAppointment(pool,{tenantId:owner.tenantId,appointmentId:item.id,generation:1,attempt:1},testConfig.TOKEN_ENC_KEY,{connect},new Date(now.getTime()+86400000),false);
  expect(connect).toHaveBeenCalledTimes(1);expect((await pool.query('SELECT sync_status FROM appointments')).rows[0].sync_status).toBe('PENDING');expect((await pool.query('SELECT google_reauth_required FROM users')).rows[0].google_reauth_required).toBe(true);
});
it('D20/RN-22 exige token da integração e, quando configurado, segredo interno adicional',async()=>{
  const {owner}=await appointment();const integration=(await request('/integrations/whatsapp',owner.cookie,'POST')).json();
  const secret='internal-fixture-'.repeat(3);const guarded=buildApp(pool,{...authDeps,config:{...testConfig,WHATSAPP_WEBHOOK_TOKEN:secret}});
  const call=(bearer:string|undefined,internal:string|undefined)=>guarded.inject({method:'POST',url:`/webhooks/whatsapp/${integration.id}`,headers:{...(bearer?{authorization:`Bearer ${bearer}`} :{}),...(internal?{'x-whatsapp-webhook-token':internal}:{}),'x-event-id':crypto.randomUUID()},payload:{phone:'5521999999999',text:'SAIR'}});
  try {
    expect((await call(integration.token,undefined)).statusCode).toBe(401);
    expect((await call(integration.token,'wrong')).statusCode).toBe(401);
    expect((await call(undefined,secret)).statusCode).toBe(401);
    expect((await call('wrong',secret)).statusCode).toBe(401);
    expect((await call(integration.token,secret)).statusCode).toBe(200);
    expect((await pool.query('SELECT token_hash FROM webhook_integrations')).rows[0].token_hash).not.toBe(integration.token);
  }finally{await guarded.close();}
});
it('D4/D7/RN-10 ignora compromisso passado, lead perdido/excluído e reply_to sem correspondência',async()=>{
  for(const scenario of ['past','lost','deleted','unmatched']){
    const {owner,lead,item}=await appointment();const integration=(await request('/integrations/whatsapp',owner.cookie,'POST')).json();
    await pool.query("UPDATE appointment_reminders SET status='SENT',message_id=$2 WHERE appointment_id=$1 AND reminder_type='INSTANT_CONFIRMATION'",[item.id,`message-${scenario}`]);
    if(scenario==='past'||scenario==='lost')await pool.query("UPDATE appointments SET start_time='2026-10-17T15:00:00Z',end_time='2026-10-17T16:00:00Z' WHERE id=$1",[item.id]);
    if(scenario==='lost')await request(`/leads/${lead.id}`,owner.cookie,'PATCH',{etapa:'PERDIDO',motivo_perda:'PRECO'});
    if(scenario==='deleted')await request(`/leads/${lead.id}`,owner.cookie,'DELETE');
    const reply=await app.inject({method:'POST',url:`/webhooks/whatsapp/${integration.id}`,headers:{authorization:`Bearer ${integration.token}`,'x-event-id':scenario},payload:{phone:lead.telefone_e164,text:'1',reply_to:scenario==='unmatched'?'unknown':`message-${scenario}`}});
    expect(reply.statusCode).toBe(200);expect(reply.json().applied).toBe(false);
    expect((await pool.query('SELECT confirmacao_cliente FROM appointments WHERE id=$1',[item.id])).rows[0].confirmacao_cliente).toBe('AGUARDANDO');
    expect((await pool.query("SELECT * FROM audit_log WHERE entidade_id=$1 AND acao='WHATSAPP_REPLY'",[lead.id])).rowCount).toBe(0);
  }
});
it('D25/RN-16 perda por interação cancela compromisso futuro e D28 mantém índice RN-03',async()=>{
  const {owner,lead,item}=await appointment();
  const result=await request(`/leads/${lead.id}/interactions`,owner.cookie,'POST',{canal:'Ligação',resumo:'Não vai seguir',etapa:'PERDIDO',motivo_perda:'TIMING',data_proximo_passo:null,descricao_proximo_passo:null});
  expect(result.statusCode,result.body).toBe(200);
  expect((await pool.query('SELECT status FROM appointments WHERE id=$1',[item.id])).rows[0].status).toBe('CANCELLED');
  expect((await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname='idx_leads_inativos'")).rows[0].indexdef).toMatch(/COALESCE\(data_ultimo_contato, created_at\)/);
});
