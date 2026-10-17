import type { FastifyInstance,FastifyRequest,HTTPMethods } from 'fastify';
import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { uuidSchema,stages } from '@operaon/shared';
import { templateSchema } from '@operaon/shared/crm';
import { DomainError } from '@operaon/shared/errors';
import { getCookie,type AuthDependencies } from './auth-routes.js';
import { withSession,requireManager,type Actor } from './session.js';
import { listLeads,findLead,createLead,updateLead,addInteraction,audit,seesAll,type Lead } from './leads.js';
import { cancelFutureAppointments } from './appointment-effects.js';

export interface CrmDependencies extends AuthDependencies { now?:()=>Date }
// Todos os módulos de negócio reutilizam esta borda transacional com sessão e RLS revalidadas.
export function secured(app:FastifyInstance,pool:Pool,deps:AuthDependencies,method:HTTPMethods,url:string,handler:(db:PoolClient,actor:Actor,request:FastifyRequest)=>Promise<unknown>) {
  app.route({method,url,handler:(request)=>withSession(pool,getCookie(request),deps.config,true,(db,actor)=>{
    request.log=request.log.child({tenant_id:actor.active_tenant_id,user_id:actor.user_id});return handler(db,actor,request);
  })});
}
const idFrom=(request:FastifyRequest)=>z.object({id:uuidSchema}).parse(request.params).id;
export function registerCrm(app:FastifyInstance,pool:Pool,deps:CrmDependencies) {
  const route=(method:HTTPMethods,url:string,fn:(db:PoolClient,actor:Actor,request:FastifyRequest)=>Promise<unknown>)=>secured(app,pool,deps,method,url,fn);
  route('GET','/leads',async(db,actor)=>listLeads(db,actor));
  route('GET','/leads/:id',async(db,actor,request)=>findLead(db,actor,idFrom(request)));
  route('POST','/leads',async(db,actor,request)=>createLead(db,actor,request.body));
  route('PATCH','/leads/:id',async(db,actor,request)=>updateLead(db,actor,idFrom(request),request.body,deps.now?.()??new Date()));
  route('DELETE','/leads/:id',async(db,actor,request)=>{
    const id=idFrom(request);await findLead(db,actor,id,true);const now=deps.now?.()??new Date();await db.query('UPDATE leads SET deleted_at=$2 WHERE id=$1',[id,now]);await cancelFutureAppointments(db,actor.active_tenant_id!,id,actor.user_id,now);await audit(db,actor,'leads',id,'DELETE');return {ok:true};
  });
  route('POST','/leads/:id/interactions',async(db,actor,request)=>addInteraction(db,actor,idFrom(request),request.body,deps.now?.()??new Date()));
  route('GET','/leads/:id/interactions',async(db,actor,request)=>{const id=idFrom(request);await findLead(db,actor,id);return (await db.query('SELECT * FROM lead_interactions WHERE lead_id=$1 ORDER BY created_at DESC',[id])).rows;});
  route('GET','/products',async(db)=>{return (await db.query('SELECT id,nome FROM products WHERE ativo=true ORDER BY nome')).rows;});

  // Fronteiras locais convertidas em instantes UTC evitam confundir ontem/hoje à meia-noite.
  route('GET','/queue',async(db,actor)=>{
    const query=await db.query<Lead&{bucket:'atrasados'|'hoje'|'proximos'}>(`WITH limits AS (SELECT (($1::timestamptz AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2) AS today,((($1::timestamptz AT TIME ZONE $2)::date+1)::timestamp AT TIME ZONE $2) AS tomorrow,((($1::timestamptz AT TIME ZONE $2)::date+8)::timestamp AT TIME ZONE $2) AS last_day)
      SELECT l.*,CASE WHEN l.data_proximo_passo<limits.today THEN 'atrasados' WHEN l.data_proximo_passo<limits.tomorrow THEN 'hoje' ELSE 'proximos' END AS bucket FROM leads l,limits WHERE l.deleted_at IS NULL AND l.etapa NOT IN ('GANHO','PERDIDO') AND (l.user_id=$3 OR $4) AND l.data_proximo_passo<limits.last_day ORDER BY l.data_proximo_passo`,[deps.now?.()??new Date(),actor.workspace!.timezone,actor.user_id,seesAll(actor)]);
    const counts={atrasados:0,hoje:0,proximos:0};for(const row of query.rows)counts[row.bucket]++;return {items:query.rows,counts};
  });
  route('GET','/funnel',async(db,actor)=>{
    const result=await db.query<{etapa:string;count:string;value:string}>('SELECT etapa,COUNT(*)::text AS count,COALESCE(SUM(valor_estimado),0)::text AS value FROM leads WHERE deleted_at IS NULL AND (user_id=$1 OR $2) GROUP BY etapa',[actor.user_id,seesAll(actor)]);
    return stages.map((etapa)=>{const group=result.rows.find((row)=>row.etapa===etapa);return {etapa,count:Number(group?.count??0),value:Number(group?.value??0)};});
  });

  // Templates pertencem ao workspace, com mutações restritas e exclusão auditada.
  route('GET','/templates',async(db)=>{return (await db.query('SELECT * FROM message_templates ORDER BY etapa,nome')).rows;});
  route('POST','/templates',async(db,actor,request)=>{requireManager(actor);const body=templateSchema.parse(request.body);const result=(await db.query('INSERT INTO message_templates(tenant_id,etapa,nome,corpo) VALUES($1,$2,$3,$4) RETURNING *',[actor.active_tenant_id,body.etapa,body.nome,body.corpo])).rows[0];await audit(db,actor,'message_templates',result.id,'CREATE');return result;});
  route('PATCH','/templates/:id',async(db,actor,request)=>{requireManager(actor);const body=templateSchema.parse(request.body);const id=idFrom(request);const result=(await db.query('UPDATE message_templates SET etapa=$2,nome=$3,corpo=$4 WHERE id=$1 RETURNING *',[id,body.etapa,body.nome,body.corpo])).rows[0];if(!result)throw new DomainError('NOT_FOUND',404);await audit(db,actor,'message_templates',id,'UPDATE');return result;});
  route('DELETE','/templates/:id',async(db,actor,request)=>{requireManager(actor);const id=idFrom(request);if(!(await db.query('DELETE FROM message_templates WHERE id=$1 RETURNING id',[id])).rowCount)throw new DomainError('NOT_FOUND',404);await audit(db,actor,'message_templates',id,'DELETE');return {ok:true};});
  route('POST','/leads/:id/message',async(db,actor,request)=>{
    const lead=await findLead(db,actor,idFrom(request));const {templateId}=z.object({templateId:uuidSchema}).strict().parse(request.body);
    const template=(await db.query<{corpo:string}>('SELECT corpo FROM message_templates WHERE id=$1',[templateId])).rows[0];if(!template)throw new DomainError('NOT_FOUND',404);
    const variables:Record<string,string>={nome:lead.nome,empresa:lead.empresa??'',necessidade:lead.necessidade_resumo};const text=template.corpo.replace(/\{(nome|empresa|necessidade)\}/g,(_match,key:string)=>variables[key]??'');
    return {text,url:`https://wa.me/${lead.telefone_e164}?text=${encodeURIComponent(text)}`};
  });
}
