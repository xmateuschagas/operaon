import Fastify from 'fastify';
import type { Pool } from 'pg';
import { ZodError } from 'zod';
import { DomainError } from '@operaon/shared/errors';
import { registerAuth, type AuthDependencies } from './auth-routes.js';
import { registerCrm,type CrmDependencies } from './crm-routes.js';
import { registerCapture } from './capture-routes.js';

// Factory separada do listener permite testar HTTP sem abrir porta.
export function buildApp(pool: Pool, auth?: AuthDependencies&Pick<CrmDependencies,'now'>) {
  const app = Fastify({ logger: process.env.NODE_ENV==='test'?false:{ base:{service:'api',tenant_id:null,user_id:null},redact: ['req.headers.cookie', 'req.headers.authorization', 'token', 'refresh_token'], serializers: { req: (req) => ({ method: req.method, url: String(req.url).split('?')[0] }) } } });
  // Erros SQL e payloads inválidos não vazam detalhes internos, tokens ou stack ao cliente.
  app.setErrorHandler((error,_request,reply)=>{
    if(error instanceof ZodError) return reply.code(400).send({code:'INVALID_INPUT',message:'Verifique os dados informados',fields:error.issues.map((issue)=>({path:issue.path,message:issue.message}))});
    if(error instanceof DomainError) return reply.code(error.status).send({code:error.code,message:error.message,details:error.details});
    if(error instanceof Error && 'code' in error && error.code==='23505')return reply.code(409).send({code:'constraint' in error&&error.constraint==='uq_leads_telefone'?'DUPLICATE_PHONE':'DUPLICATE_RECORD',message:'Registro já existente'});
    if(error instanceof Error && 'code' in error && error.code==='P0001') {const known=['ACCESS_REVOKED','INVALID_INVITATION','FORBIDDEN','INVALID_STATE','INVALID_OWNER'];if(known.includes(error.message)) return reply.code(error.message==='FORBIDDEN'||error.message==='ACCESS_REVOKED'?403:409).send({code:error.message,message:'Ação não permitida ou link inválido'});}
    if(error instanceof Error&&'statusCode' in error&&typeof error.statusCode==='number'&&error.statusCode>=400&&error.statusCode<500)return reply.code(error.statusCode).send({code:'INVALID_REQUEST',message:error.statusCode===413?'Arquivo muito grande':'Requisição inválida'});
    return reply.code(500).send({code:'INTERNAL_ERROR',message:'Não foi possível concluir a operação'});
  });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    try { await pool.query('SELECT 1'); return { status: 'ready' }; }
    catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  if(auth) {registerAuth(app,pool,auth);registerCrm(app,pool,auth);registerCapture(app,pool,auth);}
  return app;
}
