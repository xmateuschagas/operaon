import type { PoolClient } from 'pg';
import { and,eq,isNull,or,sql } from 'drizzle-orm';
import { leads } from '@operaon/shared/db/schema';
import { typedDatabase } from '@operaon/shared/db/connection';
import { leadCreateSchema,leadUpdateSchema,interactionSchema } from '@operaon/shared/crm';
import { DomainError } from '@operaon/shared/errors';
import type { Actor } from './session.js';
import { cancelFutureAppointments } from './appointment-effects.js';

export type Lead=typeof leads.$inferSelect;
export const seesAll=(actor:Actor)=>actor.workspace?.role!=='MEMBER'||actor.workspace?.lead_visibility==='compartilhado';

// Filtro de autorização complementa RLS e é aplicado em detalhes, listas e agregações.
export async function listLeads(db:PoolClient,actor:Actor) {
  return typedDatabase(db).select().from(leads).where(and(eq(leads.tenant_id,actor.active_tenant_id!),isNull(leads.deleted_at),or(eq(leads.user_id,actor.user_id),sql`${seesAll(actor)}`))).orderBy(leads.created_at);
}
export async function findLead(db:PoolClient,actor:Actor,id:string,lock=false) {
  const row=(await db.query<Lead>(`SELECT * FROM leads WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL AND (user_id=$3 OR $4)${lock?' FOR UPDATE':''}`,[id,actor.active_tenant_id,actor.user_id,seesAll(actor)])).rows[0];
  if(!row) throw new DomainError('NOT_FOUND',404);return row;
}
async function validateReferences(db:PoolClient,actor:Actor,owner:string,product?:string|null) {
  const member=(await db.query<{status:string;platform_status:string}>('SELECT m.status,p.platform_status FROM tenant_members m JOIN operaon_member_profiles() p ON p.user_id=m.user_id WHERE m.user_id=$1',[owner])).rows[0];
  if(!member||member.status!=='ACTIVE'||member.platform_status!=='ACTIVE') throw new DomainError('INVALID_OWNER',400,'Escolha um membro ativo do workspace');
  await db.query('SELECT operaon_lock_member($1)',[owner]);
  if(product&&!(await db.query('SELECT id FROM products WHERE id=$1 AND ativo=true',[product])).rowCount) throw new DomainError('INVALID_PRODUCT',400,'Produto indisponível neste workspace');
}
function validateState(lead:{etapa:string;motivo_perda?:string|null;data_proximo_passo?:Date|null;descricao_proximo_passo?:string|null}) {
  if(!['GANHO','PERDIDO'].includes(lead.etapa!)&&(!lead.data_proximo_passo||!lead.descricao_proximo_passo?.trim()))throw new DomainError('NEXT_STEP_REQUIRED',400,'Defina o próximo passo com data e descrição');
  if(lead.etapa==='PERDIDO'&&!lead.motivo_perda)throw new DomainError('LOSS_REASON_REQUIRED',400,'Informe o motivo da perda');
}
async function checkDuplicate(db:PoolClient,actor:Actor,phone:string,except?:string) {
  const duplicate=(await db.query<Lead>('SELECT * FROM leads WHERE telefone_e164=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id<>$2)',[phone,except])).rows[0];
  if(duplicate) {
    const visible=seesAll(actor)||duplicate.user_id===actor.user_id;
    throw new DomainError('DUPLICATE_PHONE',409,visible?'Telefone já cadastrado. Abra o lead existente':'Telefone já cadastrado neste workspace',visible?{lead:{id:duplicate.id,nome:duplicate.nome}}:undefined);
  }
}
export async function audit(db:PoolClient,actor:Actor,entity:string,id:string,action:string) {
  await db.query('INSERT INTO audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES($1,$2,$3,$4,$5)',[actor.active_tenant_id,actor.user_id,entity,id,action]);
}

// Criação usa apenas colunas previamente validadas; nenhuma chave arbitrária vira identificador SQL.
export async function createLead(db:PoolClient,actor:Actor,input:unknown) {
  const body=leadCreateSchema.parse(input);const owner=body.user_id??actor.user_id;
  if(owner!==actor.user_id&&actor.workspace?.role==='MEMBER')throw new DomainError('FORBIDDEN',403);
  await validateReferences(db,actor,owner,body.product_id);await checkDuplicate(db,actor,body.telefone_e164);
  const data={...body,user_id:owner,tenant_id:actor.active_tenant_id!};
  const columns=Object.keys(data);const values=Object.values(data);
  const result=(await db.query<Lead>(`INSERT INTO leads(${columns.join(',')}) VALUES(${values.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,values)).rows[0]!;
  await audit(db,actor,'leads',result.id,'CREATE');return result;
}
export async function updateLead(db:PoolClient,actor:Actor,id:string,input:unknown,now=new Date()) {
  const body=leadUpdateSchema.parse(input);const old=await findLead(db,actor,id,true);
  if(body.user_id&&body.user_id!==old.user_id&&actor.workspace?.role==='MEMBER')throw new DomainError('FORBIDDEN',403);
  await validateReferences(db,actor,body.user_id??old.user_id,body.product_id===undefined?old.product_id:body.product_id);
  if(body.telefone_e164)await checkDuplicate(db,actor,body.telefone_e164,id);
  validateState({...old,...body,data_proximo_passo:body.data_proximo_passo===undefined?old.data_proximo_passo:body.data_proximo_passo?new Date(body.data_proximo_passo):null});
  const entries=Object.entries(body).filter(([,value])=>value!==undefined);
  if(!entries.length)return old;
  const result=(await db.query<Lead>(`UPDATE leads SET ${entries.map(([key],i)=>`${key}=$${i+2}`).join(',')} WHERE id=$1 RETURNING *`,[id,...entries.map(([,value])=>value)])).rows[0]!;
  if(result.etapa==='PERDIDO')await cancelFutureAppointments(db,actor.active_tenant_id!,id,actor.user_id,now);
  await audit(db,actor,'leads',id,body.user_id&&body.user_id!==old.user_id?'ASSIGN':'UPDATE');return result;
}

// Histórico e estado corrente são gravados juntos; rollback evita contato sem próximo passo.
export async function addInteraction(db:PoolClient,actor:Actor,id:string,input:unknown,now:Date) {
  const body=interactionSchema.parse(input);const lead=await findLead(db,actor,id,true);const stage=body.etapa??lead.etapa;
  validateState({...lead,etapa:stage,motivo_perda:body.motivo_perda??lead.motivo_perda,data_proximo_passo:body.data_proximo_passo?new Date(body.data_proximo_passo):null,descricao_proximo_passo:body.descricao_proximo_passo});
  await db.query('INSERT INTO lead_interactions(tenant_id,lead_id,user_id,canal,resumo,etapa_momento,proximo_passo_definido,data_agendada_passo,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[actor.active_tenant_id,id,actor.user_id,body.canal,body.resumo,stage,body.descricao_proximo_passo,body.data_proximo_passo,now]);
  await db.query('UPDATE leads SET etapa=$2,data_ultimo_contato=$3,data_proximo_passo=$4,descricao_proximo_passo=$5,motivo_perda=COALESCE($6,motivo_perda),motivo_perda_detalhe=COALESCE($7,motivo_perda_detalhe) WHERE id=$1',[id,stage,now,body.data_proximo_passo,body.descricao_proximo_passo,body.motivo_perda,body.motivo_perda_detalhe]);
  if(stage==='PERDIDO')await cancelFutureAppointments(db,actor.active_tenant_id!,id,actor.user_id,now);
  await audit(db,actor,'leads',id,'INTERACTION');return findLead(db,actor,id);
}
