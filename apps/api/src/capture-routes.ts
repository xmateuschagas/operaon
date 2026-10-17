import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { uuidSchema } from '@operaon/shared';
import { DomainError } from '@operaon/shared/errors';
import { opaqueToken,hashToken } from '@operaon/shared/security';
import { withTenant } from '@operaon/shared/db/connection';
import { secured,type CrmDependencies } from './crm-routes.js';
import { asApp,requireManager } from './session.js';
import { takeWorkspaceQuota } from '@operaon/shared/request-limit';
import { findLead,updateLead,audit,seesAll,createLead } from './leads.js';
import { csvBody,previewCsv,importCsv,formSchema,captureActor } from './capture.js';

export function registerCapture(app:FastifyInstance,pool:Pool,deps:CrmDependencies) {
  const now=()=>deps.now?.()??new Date();
  // Inatividade conta desde a criação quando o lead nunca recebeu contato.
  secured(app,pool,deps,'GET','/review',async(db,actor)=>(await db.query("SELECT * FROM leads WHERE deleted_at IS NULL AND etapa NOT IN ('GANHO','PERDIDO') AND COALESCE(data_ultimo_contato,created_at)<$1::timestamptz-INTERVAL '7 days' AND (nutricao_ate IS NULL OR nutricao_ate<=$1) AND (user_id=$2 OR $3) ORDER BY COALESCE(data_ultimo_contato,created_at)",[now(),actor.user_id,seesAll(actor)])).rows);
  secured(app,pool,deps,'POST','/leads/:id/nurture',async(db,actor,request)=>{
    const {id}=z.object({id:uuidSchema}).parse(request.params);const {days}=z.object({days:z.union([z.literal(15),z.literal(30)])}).strict().parse(request.body);
    const lead=await findLead(db,actor,id,true);if(['GANHO','PERDIDO'].includes(lead.etapa))throw new DomainError('INVALID_STATE',409);
    await db.query('UPDATE leads SET nutricao_ate=$2 WHERE id=$1',[id,new Date(now().getTime()+days*86400000)]);await audit(db,actor,'leads',id,'NURTURE');return {ok:true};
  });
  secured(app,pool,deps,'POST','/leads/:id/reactivate',async(db,actor,request)=>{
    const {id}=z.object({id:uuidSchema}).parse(request.params);const body=z.object({data_proximo_passo:z.string().datetime({offset:true}),descricao_proximo_passo:z.string().trim().min(1).max(255)}).strict().parse(request.body);
    const lead=await findLead(db,actor,id,true);if(['GANHO','PERDIDO'].includes(lead.etapa))throw new DomainError('INVALID_STATE',409);
    await updateLead(db,actor,id,body);await db.query('UPDATE leads SET nutricao_ate=NULL WHERE id=$1',[id]);return {ok:true};
  });
  secured(app,pool,deps,'POST','/imports/preview',async(db,actor,request)=>{requireManager(actor);const {csv}=csvBody.parse(request.body);return {rows:await previewCsv(db,actor,csv,now())};});
  secured(app,pool,deps,'POST','/imports',async(db,actor,request)=>{requireManager(actor);const {csv}=csvBody.parse(request.body);return importCsv(db,actor,csv,now());});
  secured(app,pool,deps,'POST','/integrations/form',async(db,actor,request)=>{
    requireManager(actor);const body=z.object({useConfiguredToken:z.boolean().default(false)}).strict().parse(request.body??{});
    if(body.useConfiguredToken&&!actor.isPlatformAdmin)throw new DomainError('FORBIDDEN',403);
    if(body.useConfiguredToken&&!process.env.LEAD_FORM_TOKEN)throw new DomainError('FORM_TOKEN_NOT_CONFIGURED',400,'Configure LEAD_FORM_TOKEN no ambiente local');
    const token=body.useConfiguredToken?process.env.LEAD_FORM_TOKEN!:opaqueToken();
    const row=(await db.query("INSERT INTO webhook_integrations(tenant_id,kind,token_hash) VALUES($1,'FORM',$2) RETURNING id",[actor.active_tenant_id,hashToken(token)])).rows[0];
    await audit(db,actor,'webhook_integrations',row.id,'CREATE');return {id:row.id,url:`${deps.config.APP_URL}/api/webhooks/leads/${row.id}`,token};
  });

  // Resolução global é estreita; processamento e recibo compartilham uma única transação RLS.
  app.post('/webhooks/leads/:id',async(request,reply)=>{
    const {id}=z.object({id:uuidSchema}).parse(request.params);const external=z.string().min(1).max(200).parse(request.headers['x-event-id']);
    const token=request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];if(!token)throw new DomainError('UNAUTHENTICATED',401);
    const body=formSchema.parse(request.body);
    const tenant=await asApp(pool,deps.config,async(db)=>(await db.query<{tenant_id:string|null}>("SELECT operaon_resolve_integration($1,$2,'FORM') AS tenant_id",[id,hashToken(token)])).rows[0]?.tenant_id);
    if(!tenant)throw new DomainError('INVALID_INTEGRATION',401,'Integração não autorizada');
    await takeWorkspaceQuota(pool,tenant,deps.config.WORKSPACE_REQUESTS_PER_MINUTE,now());
    request.log=request.log.child({tenant_id:tenant,user_id:null});
    const result=await withTenant(pool,tenant,async(db)=>{
      const authorized=await db.query("SELECT i.id FROM webhook_integrations i JOIN tenants t ON t.id=i.tenant_id WHERE i.id=$1 AND i.active=true AND t.status='ACTIVE' AND i.token_hash=$2 FOR SHARE OF i,t",[id,hashToken(token)]);
      if(!authorized.rowCount)throw new DomainError('INVALID_INTEGRATION',401,'Integração não autorizada');
      const receipt=await db.query('INSERT INTO webhook_receipts(tenant_id,integration_id,external_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING external_id',[tenant,id,external]);
      if(!receipt.rowCount)return (await db.query<{result:{status:number;body:Record<string,unknown>}}>('SELECT result FROM webhook_receipts WHERE integration_id=$1 AND external_id=$2',[id,external])).rows[0]!.result;
      const actor=await captureActor(db,tenant);
      const lead=await createLead(db,actor,{...body,origem:'Formulário do site',etapa:'NOVO',user_id:actor.user_id,data_proximo_passo:new Date(now().getTime()+3600000).toISOString(),descricao_proximo_passo:'Primeiro contato'});
      const result={status:201,body:{id:lead.id}};await db.query('UPDATE webhook_receipts SET result=$3 WHERE integration_id=$1 AND external_id=$2',[id,external,JSON.stringify(result)]);return result;
    });
    return reply.code(result.status).send(result.body);
  });
}
