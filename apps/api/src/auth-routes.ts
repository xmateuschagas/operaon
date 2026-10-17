import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { uuidSchema } from '@operaon/shared';
import { DomainError } from '@operaon/shared/errors';
import { opaqueToken, hashToken, encryptToken, decryptToken, signValue, safeEqual } from '@operaon/shared/security';
import type { Notifier } from '@operaon/shared/notifier';
import type { AuthConfig } from './config.js';
import type { GoogleAuth } from './google-auth.js';
import { asApp, withSession, requireManager, requirePlatform, type Actor, type Workspace } from './session.js';

// Cookies contêm apenas valores base64url; parsing não depende de conteúdo enviado como JSON.
export const getCookie = (request: FastifyRequest,name='operaon_session') => request.headers.cookie?.split(';').map((part)=>part.trim()).find((part)=>part.startsWith(`${name}=`))?.slice(name.length+1);
const cookie=(name:string,value:string,config:AuthConfig,seconds:number)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(config.APP_URL).protocol==='https:'?'; Secure':''}`;
const idParam=z.object({id:uuidSchema});
const tokenBody=z.object({token:z.string().min(32).max(200)}).strict();
const roleSchema=z.enum(['OWNER','ADMIN','MEMBER']);
const timezoneSchema=z.string().max(60).refine((zone)=>{try{new Intl.DateTimeFormat('pt-BR',{timeZone:zone});return true;}catch{return false;}},'Fuso horário inválido');
export interface AuthDependencies { config: AuthConfig; google: GoogleAuth; notifier: Notifier; onWorkspaceActivated?:(db:PoolClient,userId:string,tenantId:string)=>Promise<void> }

export function registerAuth(app:FastifyInstance,pool:Pool,deps:AuthDependencies) {
  const {config,google,notifier}=deps;
  // Requisições mutáveis de navegador exigem a origem da aplicação. Webhooks terão validação própria.
  app.addHook('preHandler',async(request)=>{
    if(['POST','PATCH','PUT','DELETE'].includes(request.method) && !request.url.startsWith('/webhooks/')) {
      if(request.headers.origin!==new URL(config.APP_URL).origin) throw new DomainError('INVALID_ORIGIN',403,'Origem não autorizada');
    }
  });
  type Handler=(db:PoolClient,actor:Actor,request:FastifyRequest,reply:FastifyReply)=>Promise<unknown>;
  const route=(method:'GET'|'POST'|'PATCH',url:string,tenant:boolean,handler:Handler)=>app.route({method,url,handler:async(request,reply)=>{
    return withSession(pool,getCookie(request),config,tenant,async(db,actor)=>{
      request.log=request.log.child({tenant_id:actor.active_tenant_id,user_id:actor.user_id});
      return handler(db,actor,request,reply);
    });
  }});

  // Login básico nunca solicita Calendar; consentimento incremental exige vínculo ativo.
  app.get('/auth/google',async(request,reply)=>{
    const query=z.object({calendar:z.enum(['true','false']).optional()}).strict().parse(request.query);
    const calendar=query.calendar==='true';
    let userId:string|null=null;
    if(calendar) userId=await withSession(pool,getCookie(request),config,true,async(_db,actor)=>actor.user_id);
    const state=opaqueToken();const verifier=opaqueToken();
    await asApp(pool,config,(db)=>db.query('INSERT INTO oauth_states(state_hash,verifier_enc,user_id,calendar,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL \'10 minutes\')',[hashToken(state),encryptToken(verifier,config.TOKEN_ENC_KEY),userId,calendar]));
    reply.header('set-cookie',cookie('operaon_oauth',signValue(state,config.SESSION_SECRET),config,600));
    return reply.redirect(google.authorize(state,Buffer.from(hashToken(verifier),'hex').toString('base64url'),calendar));
  });
  // Callback só troca código após validar a ligação state/cookie e consumir o estado no banco.
  app.get('/auth/google/callback',async(request,reply)=>{
    const query=z.object({code:z.string().min(1).max(4096),state:z.string().min(32).max(200)}).parse(request.query);
    if(!safeEqual(getCookie(request,'operaon_oauth')??'',signValue(query.state,config.SESSION_SECRET))) throw new DomainError('INVALID_OAUTH_STATE',401,'Autenticação expirada');
    const raw=opaqueToken();
    await asApp(pool,config,async(db)=>{
      const state=(await db.query<{verifier_enc:string;user_id:string|null;calendar:boolean}>('UPDATE oauth_states SET used_at=NOW() WHERE state_hash=$1 AND used_at IS NULL AND expires_at>NOW() RETURNING verifier_enc,user_id,calendar',[hashToken(query.state)])).rows[0];
      if(!state) throw new DomainError('INVALID_OAUTH_STATE',401);
      const identity=await google.exchange(query.code,decryptToken(state.verifier_enc,config.TOKEN_ENC_KEY));
      const person=(await db.query<{id:string}>('SELECT operaon_login($1,$2,$3) AS id',[identity.sub,identity.email,identity.name])).rows[0]!.id;
      if(state.user_id && state.user_id!==person) throw new DomainError('GOOGLE_ACCOUNT_MISMATCH',403,'Use a mesma conta Google');
      if(state.calendar&&!identity.calendarAuthorized) throw new DomainError('CALENDAR_NOT_AUTHORIZED',403,'Autorize a agenda OperaON');
      if(identity.refreshToken || state.calendar) await db.query('SELECT operaon_save_google($1,$2,$3)',[person,identity.refreshToken?encryptToken(identity.refreshToken,config.TOKEN_ENC_KEY):null,state.calendar]);
      const previous=getCookie(request);
      const oldSession=previous?(await db.query<{user_id:string;active_tenant_id:string|null}>('SELECT * FROM operaon_session($1)',[hashToken(previous)])).rows[0]:undefined;
      if(previous)await db.query('SELECT operaon_logout($1)',[hashToken(previous)]);
      await db.query('SELECT operaon_create_session($1,$2,$3)',[person,hashToken(raw),new Date(Date.now()+config.SESSION_DAYS*86400000)]);
      if(oldSession?.user_id===person&&oldSession.active_tenant_id){await db.query('SELECT operaon_choose_workspace($1,$2)',[hashToken(raw),oldSession.active_tenant_id]);await db.query("SELECT set_config('app.tenant_id',$1,true)",[oldSession.active_tenant_id]);await deps.onWorkspaceActivated?.(db,person,oldSession.active_tenant_id);}
    });
    reply.header('set-cookie',[cookie('operaon_session',raw,config,config.SESSION_DAYS*86400),cookie('operaon_oauth','',config,0)]);
    return reply.redirect(config.APP_URL);
  });
  // Descoberta global expõe somente vínculos da pessoa autenticada, sem dados de negócio.
  route('GET','/session',false,async(db,actor)=>({user:{id:actor.user_id,email:actor.email,nome:actor.nome},activeTenantId:actor.active_tenant_id,isPlatformAdmin:actor.isPlatformAdmin,google:(await db.query('SELECT * FROM operaon_google_status($1)',[actor.user_id])).rows[0],workspaces:(await db.query<Workspace>('SELECT * FROM operaon_workspaces($1)',[actor.user_id])).rows}));
  route('POST','/logout',false,async(db,_actor,request,reply)=>{
    await db.query('SELECT operaon_logout($1)',[hashToken(getCookie(request)!)]);
    reply.header('set-cookie',cookie('operaon_session','',config,0));return {ok:true};
  });
  route('POST','/session/workspace',false,async(db,actor,request)=>{
    const {tenantId}=z.object({tenantId:uuidSchema.nullable()}).strict().parse(request.body);
    if(tenantId) {
      const target=(await db.query<Workspace>('SELECT * FROM operaon_workspaces($1)',[actor.user_id])).rows.find((item)=>item.id===tenantId);
      if(!target||target.member_status==='BLOCKED'||target.status==='BLOCKED') throw new DomainError('ACCESS_REVOKED',403);
      if(target.member_status!=='ACTIVE'||target.status!=='ACTIVE') throw new DomainError('USER_PENDING_APPROVAL',403);
    }
    await db.query('SELECT operaon_choose_workspace($1,$2)',[hashToken(getCookie(request)!),tenantId]);
    if(tenantId){await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);await deps.onWorkspaceActivated?.(db,actor.user_id,tenantId);}return {ok:true};
  });
  // Onboarding cria workspace e OWNER pendentes em uma operação restrita e auditável.
  route('POST','/workspaces',false,async(db,actor,request)=>{
    const {nome}=z.object({nome:z.string().trim().min(1).max(150)}).strict().parse(request.body);
    const id=(await db.query<{id:string}>('SELECT operaon_request_workspace($1,$2) AS id',[actor.user_id,nome])).rows[0]!.id;
    await db.query("SELECT set_config('app.tenant_id',$1,true)",[id]);
    const token=opaqueToken();await db.query("INSERT INTO approval_tokens(tenant_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')",[id,hashToken(token)]);
    await notifier.notify({kind:'approval',tenantId:id,userId:actor.user_id,link:`${config.APP_URL}/aprovar?token=${token}`,message:'Novo workspace aguardando aprovação'});
    return {id,status:'PENDING'};
  });
  // Papel de plataforma não concede acesso aos leads ou membros de um workspace.
  route('GET','/platform/workspaces',false,async(db,actor)=>{requirePlatform(actor);return (await db.query('SELECT * FROM operaon_platform_pending($1)',[actor.user_id])).rows;});
  route('POST','/platform/workspaces/:id/approve',false,async(db,actor,request)=>{requirePlatform(actor);const {id}=idParam.parse(request.params);await db.query('SELECT operaon_platform_approve($1,$2)',[actor.user_id,id]);return {ok:true};});
  route('POST','/platform/users/:id/block',false,async(db,actor,request)=>{requirePlatform(actor);const {id}=idParam.parse(request.params);if(id===actor.user_id) throw new DomainError('CANNOT_BLOCK_SELF',409);await db.query('SELECT operaon_platform_block($1,$2)',[actor.user_id,id]);return {ok:true};});
  route('PATCH','/workspace',true,async(db,actor,request)=>{
    requireManager(actor);
    const body=z.object({nome:z.string().trim().min(1).max(150).optional(),timezone:timezoneSchema.optional(),lead_visibility:z.enum(['proprios','compartilhado']).optional()}).strict().parse(request.body);
    await db.query('UPDATE tenants SET nome=COALESCE($2,nome),timezone=COALESCE($3,timezone),lead_visibility=COALESCE($4,lead_visibility) WHERE id=$1',[actor.active_tenant_id,body.nome,body.timezone,body.lead_visibility]);
    await db.query("INSERT INTO audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES($1,$2,'tenants',$1,'CONFIGURE')",[actor.active_tenant_id,actor.user_id]);return {ok:true};
  });
  // Aprovação/bloqueio locais são protegidos pelo papel no vínculo e pela transação RLS.
  route('GET','/members',true,async(db,actor)=>{requireManager(actor);return (await db.query('SELECT m.user_id,m.role,m.status,m.created_at,p.email,p.nome,p.platform_status FROM tenant_members m JOIN operaon_member_profiles() p ON p.user_id=m.user_id ORDER BY m.created_at')).rows;});
  route('POST','/members/:id/approve',true,async(db,actor,request)=>{
    requireManager(actor);const {id}=idParam.parse(request.params);
    const updated=await db.query("UPDATE tenant_members SET status='ACTIVE' WHERE user_id=$1 AND status='PENDING' RETURNING user_id",[id]);
    if(!updated.rowCount) throw new DomainError('INVALID_STATE',409);
    await db.query("INSERT INTO audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES($1,$2,'tenant_members',$3,'APPROVE')",[actor.active_tenant_id,actor.user_id,id]);return {ok:true};
  });
  route('POST','/members/:id/block',true,async(db,actor,request)=>{
    requireManager(actor);const {id}=idParam.parse(request.params);
    const target=(await db.query<{role:string;status:string}>('SELECT role,status FROM tenant_members WHERE user_id=$1 FOR UPDATE',[id])).rows[0];
    if(!target) throw new DomainError('NOT_FOUND',404);
    if(target.role==='OWNER'&&target.status==='ACTIVE'&&(await db.query("SELECT user_id FROM tenant_members WHERE role='OWNER' AND status='ACTIVE'")).rowCount===1) throw new DomainError('LAST_OWNER',409,'Mantenha um proprietário ativo');
    await db.query("UPDATE tenant_members SET status='BLOCKED' WHERE user_id=$1",[id]);
    await db.query('SELECT operaon_clear_member_sessions($1,$2)',[actor.active_tenant_id,id]);
    await db.query("INSERT INTO audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES($1,$2,'tenant_members',$3,'BLOCK')",[actor.active_tenant_id,actor.user_id,id]);return {ok:true};
  });
  // Convite retorna o link só ao gestor e guarda apenas hash; Notifier omite token dos logs.
  route('POST','/invitations',true,async(db,actor,request)=>{
    requireManager(actor);const body=z.object({email:z.string().email().transform((value)=>value.toLowerCase()),role:roleSchema.default('MEMBER')}).strict().parse(request.body);
    const token=opaqueToken();const expires=new Date(Date.now()+config.INVITATION_DAYS*86400000);
    const invitation=(await db.query('INSERT INTO invitations(tenant_id,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at',[actor.active_tenant_id,body.email,body.role,hashToken(token),expires])).rows[0];
    const link=`${config.APP_URL}/convite?token=${token}`;
    await notifier.notify({kind:'invitation',tenantId:actor.active_tenant_id!,destination:body.email,link,message:'Convite para workspace OperaON'});
    return {...invitation,link};
  });
  route('POST','/invitations/accept',false,async(db,actor,request)=>{const {token}=tokenBody.parse(request.body);const row=(await db.query('SELECT operaon_accept_invite($1,$2) AS tenant_id',[actor.user_id,hashToken(token)])).rows[0];return row;});
  route('POST','/approvals/consume',false,async(db,actor,request)=>{
    const {token}=tokenBody.parse(request.body);const digest=hashToken(token);
    const target=(await db.query<{tenant_id:string;user_id:string|null}>('SELECT * FROM operaon_approval_target($1)',[digest])).rows[0];
    if(!target) throw new DomainError('INVALID_APPROVAL',410,'Link expirado ou já utilizado');
    await db.query("SELECT set_config('app.tenant_id',$1,true)",[target.tenant_id]);
    if(!target.user_id) {requirePlatform(actor);await db.query('SELECT operaon_platform_approve($1,$2)',[actor.user_id,target.tenant_id]);}
    else {
      if(!(await db.query("SELECT id FROM tenants WHERE status='ACTIVE'")).rowCount) throw new DomainError('ACCESS_REVOKED',403);
      const membership=(await db.query<{role:string;status:string}>('SELECT role,status FROM tenant_members WHERE user_id=$1',[actor.user_id])).rows[0];
      if(!membership||membership.status!=='ACTIVE'||membership.role==='MEMBER') throw new DomainError('FORBIDDEN',403);
      const updated=await db.query("UPDATE tenant_members SET status='ACTIVE' WHERE user_id=$1 AND status='PENDING' RETURNING user_id",[target.user_id]);
      if(!updated.rowCount) throw new DomainError('INVALID_STATE',409);
      await db.query("INSERT INTO audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES($1,$2,'tenant_members',$3,'APPROVE')",[target.tenant_id,actor.user_id,target.user_id]);
    }
    await db.query('UPDATE approval_tokens SET used_at=NOW() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()',[digest]);return {ok:true};
  });
}
