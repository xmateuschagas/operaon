import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { uuidSchema } from '@operaon/shared';
import { DomainError } from '@operaon/shared/errors';
import { opaqueToken,hashToken } from '@operaon/shared/security';
import { withTenant } from '@operaon/shared/db/connection';
import { enqueueJob } from '@operaon/shared/jobs';
import { secured,type CrmDependencies } from './crm-routes.js';
import { asApp,requireManager } from './session.js';
import type { Lead } from './leads.js';

const received=z.object({phone:z.string().regex(/^[1-9]\d{7,14}$/),text:z.string().trim().min(1).max(2000),reply_to:z.string().min(1).max(200).optional()}).strict();
// Autenticação da integração e recibo são independentes da sessão de navegador.
export function registerWhatsApp(app:FastifyInstance,pool:Pool,deps:CrmDependencies) {
  secured(app,pool,deps,'POST','/integrations/whatsapp',async(db,actor)=>{
    requireManager(actor);const token=opaqueToken();const row=(await db.query("INSERT INTO webhook_integrations(tenant_id,kind,token_hash) VALUES($1,'WHATSAPP',$2) RETURNING id",[actor.active_tenant_id,hashToken(token)])).rows[0]!;
    await db.query("INSERT INTO audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES($1,$2,'webhook_integrations',$3,'CREATE')",[actor.active_tenant_id,actor.user_id,row.id]);
    return {id:row.id,url:`${deps.config.APP_URL}/api/webhooks/whatsapp/${row.id}`,token};
  });
  app.post('/webhooks/whatsapp/:id',async(request)=>{
    const {id}=z.object({id:uuidSchema}).parse(request.params);const external=z.string().min(1).max(200).parse(request.headers['x-event-id']);const body=received.parse(request.body);
    const token=request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];if(!token)throw new DomainError('UNAUTHENTICATED',401);
    const tenant=await asApp(pool,deps.config,async(db)=>(await db.query<{tenant_id:string|null}>("SELECT operaon_resolve_integration($1,$2,'WHATSAPP') AS tenant_id",[id,hashToken(token)])).rows[0]?.tenant_id);
    if(!tenant)throw new DomainError('INVALID_INTEGRATION',401);request.log=request.log.child({tenant_id:tenant,user_id:null});
    return withTenant(pool,tenant,async(db)=>{
      const integration=await db.query("SELECT i.id FROM webhook_integrations i JOIN tenants t ON t.id=i.tenant_id WHERE i.id=$1 AND i.active AND t.status='ACTIVE' AND i.token_hash=$2 FOR SHARE OF i,t",[id,hashToken(token)]);if(!integration.rowCount)throw new DomainError('INVALID_INTEGRATION',401);
      const receipt=await db.query('INSERT INTO webhook_receipts(tenant_id,integration_id,external_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING external_id',[tenant,id,external]);
      if(!receipt.rowCount)return (await db.query('SELECT result FROM webhook_receipts WHERE integration_id=$1 AND external_id=$2',[id,external])).rows[0]!.result;
      const text=body.text.toUpperCase();let applied=false;
      // SAIR é seguro mesmo sem contexto de resposta: desliga apenas o lead no workspace autenticado.
      const lead=(await db.query<Lead>('SELECT * FROM leads WHERE telefone_e164=$1 AND deleted_at IS NULL FOR UPDATE',[body.phone])).rows[0];
      if(lead&&text==='SAIR'){await db.query('UPDATE leads SET whatsapp_opt_in=false WHERE id=$1',[lead.id]);applied=true;}
      else if(lead&&body.reply_to&&['1','2'].includes(text)){
        const appointment=(await db.query<{id:string;titulo:string}>("SELECT a.id,a.titulo FROM appointments a JOIN appointment_reminders r ON r.appointment_id=a.id WHERE r.message_id=$1 AND a.lead_id=$2 AND a.deleted_at IS NULL AND a.status IN ('SCHEDULED','CONFIRMED') AND r.status='SENT' FOR UPDATE OF a",[body.reply_to,lead.id])).rows[0];
        if(appointment){
          await db.query("UPDATE appointments SET confirmacao_cliente=$2::client_confirmation,status=CASE WHEN $2::client_confirmation='CONFIRMADO' THEN 'CONFIRMED'::appointment_status ELSE status END WHERE id=$1",[appointment.id,text==='1'?'CONFIRMADO':'REMARCAR']);
          if(text==='2'&&lead.etapa!=='GANHO'&&lead.etapa!=='PERDIDO')await db.query('UPDATE leads SET data_proximo_passo=$2,descricao_proximo_passo=$3 WHERE id=$1',[lead.id,deps.now?.()??new Date(),`Remarcar: ${appointment.titulo}`]);
          if(text==='2'&&lead.etapa==='GANHO')await deps.notifier.notify({kind:'reschedule',tenantId:tenant,userId:lead.user_id,message:`Remarcar compromisso: ${appointment.titulo}`});
          await enqueueJob(db,tenant,'sync_google',{appointmentId:appointment.id});applied=true;
        }
      }
      if(applied)await db.query("INSERT INTO audit_log(tenant_id,entidade,entidade_id,acao,dados) VALUES($1,'leads',$2,'WHATSAPP_REPLY',$3)",[tenant,lead!.id,JSON.stringify({action:text==='SAIR'?'OPT_OUT':text==='1'?'CONFIRM':'RESCHEDULE'})]);
      const result={ok:true,applied};await db.query('UPDATE webhook_receipts SET result=$3 WHERE integration_id=$1 AND external_id=$2',[id,external,JSON.stringify(result)]);return result;
    });
  });
}
