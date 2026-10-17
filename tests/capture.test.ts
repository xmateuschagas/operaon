import { beforeEach,afterAll,it,expect } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { testPool,resetDatabase } from './database.js';
import { authDeps,identity,leadInput } from './fixtures.js';

const pool=testPool();const now=new Date('2026-10-16T15:00:00Z');const app=buildApp(pool,{...authDeps,now:()=>now});
const request=(url:string,cookie:string,method:'GET'|'POST'|'PATCH'='GET',payload?:Record<string,unknown>)=>app.inject({url,method,headers:{origin:authDeps.config.APP_URL,cookie},payload});
beforeEach(async()=>{await resetDatabase(pool);});afterAll(async()=>{await app.close();await pool.end();});

it('RN-03/RN-04 revisão inclui nunca contatado, respeita nutrição e fecha com motivo',async()=>{
  const owner=await identity(pool);const lead=(await request('/leads',owner.cookie,'POST',leadInput())).json();
  await pool.query("UPDATE leads SET created_at=$2::timestamptz-INTERVAL '8 days' WHERE id=$1",[lead.id,now]);
  expect((await request('/review',owner.cookie)).json()).toHaveLength(1);
  expect((await request(`/leads/${lead.id}/nurture`,owner.cookie,'POST',{days:14})).statusCode).toBe(400);
  expect((await request(`/leads/${lead.id}/nurture`,owner.cookie,'POST',{days:15})).statusCode).toBe(200);
  expect((await request('/review',owner.cookie)).json()).toHaveLength(0);
  expect((await pool.query('SELECT nutricao_ate FROM leads WHERE id=$1',[lead.id])).rows[0].nutricao_ate).toEqual(new Date(now.getTime()+15*86400000));
  await request(`/leads/${lead.id}/reactivate`,owner.cookie,'POST',{data_proximo_passo:'2026-10-17T15:00:00Z',descricao_proximo_passo:'Ligar'});
  expect((await pool.query('SELECT data_ultimo_contato,nutricao_ate FROM leads WHERE id=$1',[lead.id])).rows[0]).toMatchObject({data_ultimo_contato:null,nutricao_ate:null});
  await request(`/leads/${lead.id}`,owner.cookie,'PATCH',{etapa:'PERDIDO',motivo_perda:'TIMING'});
  expect((await request('/review',owner.cookie)).json()).toHaveLength(0);
});
it('RN-07/RN-15/RN-23 formulário tem defaults e reentrega concorrente idempotente',async()=>{
  const owner=await identity(pool);await pool.query('UPDATE tenants SET default_owner_user_id=$2 WHERE id=$1',[owner.tenantId,owner.userId]);
  const integration=(await request('/integrations/form',owner.cookie,'POST',{})).json();
  const payload={nome:'Formulário',telefone_e164:'+55 21 99999-9999',necessidade_resumo:'Site',utm_source:'campanha'};
  const call=()=>app.inject({method:'POST',url:`/webhooks/leads/${integration.id}`,headers:{authorization:`Bearer ${integration.token}`,'x-event-id':'event-1'},payload});
  const results=await Promise.all([call(),call()]);expect(results.map((result)=>result.statusCode)).toEqual([201,201]);expect(results[0]!.json().id).toBe(results[1]!.json().id);
  const leads=(await pool.query('SELECT * FROM leads')).rows;expect(leads).toHaveLength(1);expect(leads[0]).toMatchObject({origem:'Formulário do site',etapa:'NOVO',user_id:owner.userId,descricao_proximo_passo:'Primeiro contato',utm_source:'campanha'});
  expect(leads[0].data_proximo_passo).toEqual(new Date(now.getTime()+3600000));
  expect((await app.inject({method:'POST',url:`/webhooks/leads/${integration.id}`,headers:{authorization:'Bearer invalid','x-event-id':'bad'},payload})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:`/webhooks/leads/${integration.id}`,headers:{authorization:`Bearer ${integration.token}`,'x-event-id':'second'},payload})).statusCode).toBe(409);
});
it('RN-15 ignora bloqueio local/global e falha sem responsável elegível',async()=>{
  const owner=await identity(pool);const admin=await identity(pool,'ADMIN',owner.tenantId);const member=await identity(pool,'MEMBER',owner.tenantId);
  await pool.query('UPDATE tenants SET default_owner_user_id=$2 WHERE id=$1',[owner.tenantId,member.userId]);
  const integration=(await request('/integrations/form',owner.cookie,'POST',{})).json();
  await pool.query("UPDATE users SET platform_status='BLOCKED' WHERE id=$1",[member.userId]);
  await pool.query("UPDATE tenant_members SET status='BLOCKED' WHERE user_id=$1",[owner.userId]);
  const payload={nome:'Fallback',telefone_e164:'5521999999999',necessidade_resumo:'Produto'};
  const result=await app.inject({method:'POST',url:`/webhooks/leads/${integration.id}`,headers:{authorization:`Bearer ${integration.token}`,'x-event-id':'fallback'},payload});expect(result.statusCode).toBe(201);
  expect((await pool.query('SELECT user_id FROM leads')).rows[0].user_id).toBe(admin.userId);
  await pool.query("UPDATE tenant_members SET status='BLOCKED' WHERE user_id=$1",[admin.userId]);
  expect((await app.inject({method:'POST',url:`/webhooks/leads/${integration.id}`,headers:{authorization:`Bearer ${integration.token}`,'x-event-id':'none'},payload:{...payload,telefone_e164:'5521888888888'}})).statusCode).toBe(503);
});
it('CSV prévia não grava, suporta aspas/BOM, relata duplicados e aplica RN-07/RN-15',async()=>{
  const owner=await identity(pool);const member=await identity(pool,'MEMBER',owner.tenantId);const other=await identity(pool);
  const email=(await pool.query('SELECT email FROM users WHERE id=$1',[other.userId])).rows[0].email;
  const csv=`\uFEFFnome;telefone;origem;necessidade;responsavel_email\n"Ana; Silva";5521999999999;;;\nDuplicado;5521999999999;;;\nInválido;abc;;;\nOutro;5521888888888;;;${email}`;
  const preview=await request('/imports/preview',owner.cookie,'POST',{csv});expect(preview.statusCode).toBe(200);expect(preview.json().rows.map((row:{status:string})=>row.status)).toEqual(['valid','duplicate','error','error']);
  expect((await pool.query('SELECT * FROM leads')).rowCount).toBe(0);
  const imported=(await request('/imports',owner.cookie,'POST',{csv})).json();expect(imported).toMatchObject({created:1,duplicates:1,errors:2});
  expect((await pool.query('SELECT * FROM leads')).rows[0]).toMatchObject({nome:'Ana; Silva',origem:'Importação CSV',necessidade_resumo:'Não informada',user_id:owner.userId,whatsapp_opt_in:false});
  expect((await request('/imports',owner.cookie,'POST',{csv})).json().created).toBe(0);
  expect((await request('/imports',member.cookie,'POST',{csv})).statusCode).toBe(403);
});
it('RN-22 integrações e capturas mantêm tenants distintos com mesmo telefone',async()=>{
  const first=await identity(pool);const second=await identity(pool);
  for(const owner of [first,second]){
    const integration=(await request('/integrations/form',owner.cookie,'POST',{})).json();
    expect((await app.inject({method:'POST',url:`/webhooks/leads/${integration.id}`,headers:{authorization:`Bearer ${integration.token}`,'x-event-id':'same-event'},payload:{nome:'Pessoa',telefone_e164:'5521999999999',necessidade_resumo:'Produto'}})).statusCode).toBe(201);
  }
  expect((await pool.query('SELECT * FROM leads')).rowCount).toBe(2);
  expect((await request('/leads',first.cookie)).json()).toHaveLength(1);
  expect((await request('/leads',second.cookie)).json()).toHaveLength(1);
});
