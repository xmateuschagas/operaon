import { beforeEach,afterAll,it,expect } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { testPool,resetDatabase } from './database.js';
import { authDeps,identity,leadInput } from './fixtures.js';
import { withTenant } from '../packages/shared/src/db/connection.js';

const pool=testPool();const now=new Date('2026-10-17T01:00:00Z');
const app=buildApp(pool,{...authDeps,now:()=>now});
const request=(url:string,cookie:string,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',payload?:Record<string,unknown>)=>app.inject({url,method,headers:{origin:authDeps.config.APP_URL,cookie},payload});
beforeEach(async()=>{await resetDatabase(pool);});
afterAll(async()=>{await app.close();await pool.end();});

// Regras são verificadas na borda HTTP e no estado persistido, não por espelhar funções internas.
it('RN-01/RN-05 exigem próximo passo e motivo de perda',async()=>{
  const owner=await identity(pool);
  expect((await request('/leads',owner.cookie,'POST',{...leadInput(),data_proximo_passo:null})).statusCode).toBe(400);
  expect((await request('/leads',owner.cookie,'POST',{...leadInput(),etapa:'PERDIDO'})).statusCode).toBe(400);
  const lead=(await request('/leads',owner.cookie,'POST',leadInput())).json();
  expect((await request(`/leads/${lead.id}`,owner.cookie,'PATCH',{data_proximo_passo:null})).statusCode).toBe(400);
  expect((await request(`/leads/${lead.id}`,owner.cookie,'PATCH',{etapa:'PERDIDO',motivo_perda:'TIMING'})).statusCode).toBe(200);
});
it('RN-02 interação grava histórico e atualiza contato/próximo passo atomicamente',async()=>{
  const owner=await identity(pool);const lead=(await request('/leads',owner.cookie,'POST',leadInput())).json();
  const invalid=await request(`/leads/${lead.id}/interactions`,owner.cookie,'POST',{canal:'WhatsApp',resumo:'Conversa',data_proximo_passo:null,descricao_proximo_passo:null});
  expect(invalid.statusCode).toBe(400);expect((await pool.query('SELECT * FROM lead_interactions')).rowCount).toBe(0);
  expect((await pool.query('SELECT data_ultimo_contato FROM leads WHERE id=$1',[lead.id])).rows[0].data_ultimo_contato).toBeNull();
  const valid=await request(`/leads/${lead.id}/interactions`,owner.cookie,'POST',{canal:'WhatsApp',resumo:'Conversa',etapa:'QUALIFICADO',data_proximo_passo:'2026-10-18T13:00:00Z',descricao_proximo_passo:'Enviar proposta'});
  expect(valid.statusCode).toBe(200);expect(valid.json().data_ultimo_contato).toBe(now.toISOString());
  const history=(await request(`/leads/${lead.id}/interactions`,owner.cookie)).json();expect(history).toHaveLength(1);expect(history[0].proximo_passo_definido).toBe('Enviar proposta');
  await expect(withTenant(pool,owner.tenantId,(db)=>db.query("UPDATE lead_interactions SET resumo='Alterado'"))).rejects.toMatchObject({code:'42501'});
});
it('RN-06 normaliza, deduplica por tenant e não revela lead privado',async()=>{
  const owner=await identity(pool);const member=await identity(pool,'MEMBER',owner.tenantId);const other=await identity(pool);
  const original=(await request('/leads',owner.cookie,'POST',{...leadInput(),telefone_e164:'+55 (21) 99999-9999'})).json();
  expect(original.telefone_e164).toBe('5521999999999');
  const privateDuplicate=await request('/leads',member.cookie,'POST',leadInput());expect(privateDuplicate.statusCode).toBe(409);expect(privateDuplicate.body).not.toContain(original.id);
  const ownDuplicate=await request('/leads',owner.cookie,'POST',leadInput());expect(ownDuplicate.json().details.lead.id).toBe(original.id);
  expect((await request('/leads',other.cookie,'POST',leadInput())).statusCode).toBe(200);
});
it('RN-19/RN-22 aplicam visibilidade e reservam troca de responsável a OWNER/ADMIN',async()=>{
  const owner=await identity(pool);const member=await identity(pool,'MEMBER',owner.tenantId);const other=await identity(pool);
  const own=(await request('/leads',owner.cookie,'POST',leadInput())).json();
  expect((await request(`/leads/${own.id}`,member.cookie)).statusCode).toBe(404);
  expect((await request(`/leads/${own.id}`,other.cookie)).statusCode).toBe(404);
  await request('/workspace',owner.cookie,'PATCH',{lead_visibility:'compartilhado'});
  expect((await request(`/leads/${own.id}`,member.cookie,'PATCH',{nome:'Editado por membro'})).statusCode).toBe(200);
  expect((await request(`/leads/${own.id}`,member.cookie,'PATCH',{user_id:member.userId})).statusCode).toBe(403);
  expect((await request(`/leads/${own.id}`,owner.cookie,'PATCH',{user_id:other.userId})).statusCode).toBe(400);
  expect((await request(`/leads/${own.id}`,owner.cookie,'PATCH',{user_id:member.userId})).statusCode).toBe(200);
  await request('/workspace',owner.cookie,'PATCH',{lead_visibility:'proprios'});
  expect((await request(`/leads/${own.id}`,member.cookie)).statusCode).toBe(200);
  expect((await request('/leads',owner.cookie)).json()).toHaveLength(1);
});
it('RN-12 exclui logicamente e registra auditoria',async()=>{
  const owner=await identity(pool);const lead=(await request('/leads',owner.cookie,'POST',leadInput())).json();
  expect((await request(`/leads/${lead.id}`,owner.cookie,'DELETE')).statusCode).toBe(200);
  expect((await request(`/leads/${lead.id}`,owner.cookie)).statusCode).toBe(404);
  expect((await pool.query('SELECT deleted_at FROM leads WHERE id=$1',[lead.id])).rows[0].deleted_at).toEqual(now);
  expect((await pool.query("SELECT * FROM audit_log WHERE entidade_id=$1 AND acao='DELETE'",[lead.id])).rowCount).toBe(1);
});
it('RN-22 fila usa dia do workspace e funil mantém soma por etapa',async()=>{
  const owner=await identity(pool);
  for(const [index,date] of ['2026-10-16T01:00:00Z','2026-10-17T01:30:00Z','2026-10-17T15:00:00Z'].entries())await request('/leads',owner.cookie,'POST',{...leadInput(`552199999990${index}`),data_proximo_passo:date,valor_estimado:100});
  const queue=(await request('/queue',owner.cookie)).json();expect(queue.counts).toEqual({atrasados:1,hoje:1,proximos:1});
  const funnel=(await request('/funnel',owner.cookie)).json();expect(funnel.find((group:{etapa:string})=>group.etapa==='NOVO')).toMatchObject({count:3,value:300});
});
it('templates interpolam dados com URL encoding e exclusão auditada',async()=>{
  const owner=await identity(pool);const member=await identity(pool,'MEMBER',owner.tenantId);const lead=(await request('/leads',owner.cookie,'POST',{...leadInput(),nome:'João & Ana'})).json();
  const template=(await request('/templates',owner.cookie,'POST',{etapa:'NOVO',nome:'Primeiro contato',corpo:'Olá {nome}, sobre {necessidade}'})).json();
  const message=(await request(`/leads/${lead.id}/message`,owner.cookie,'POST',{templateId:template.id})).json();expect(new URL(message.url).searchParams.get('text')).toBe('Olá João & Ana, sobre Conhecer produto');
  expect((await request(`/templates/${template.id}`,member.cookie,'DELETE')).statusCode).toBe(403);
  expect((await request(`/templates/${template.id}`,owner.cookie,'DELETE')).statusCode).toBe(200);
  expect((await pool.query("SELECT * FROM audit_log WHERE entidade='message_templates' AND acao='DELETE'")).rowCount).toBe(1);
});
