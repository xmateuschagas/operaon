import Fastify from 'fastify';
import type { Pool } from 'pg';
import { ZodError } from 'zod';
import { DomainError } from '@operaon/shared/errors';
import { registerAuth, type AuthDependencies } from './auth-routes.js';

// Factory separada do listener permite testar HTTP sem abrir porta.
export function buildApp(pool: Pool, auth?: AuthDependencies) {
  const app = Fastify({ logger: process.env.NODE_ENV==='test'?false:{ base:{service:'api',tenant_id:null,user_id:null},redact: ['req.headers.cookie', 'req.headers.authorization', 'token', 'refresh_token'], serializers: { req: (req) => ({ method: req.method, url: String(req.url).split('?')[0] }) } } });
  // Erros SQL e payloads inválidos não vazam detalhes internos, tokens ou stack ao cliente.
  app.setErrorHandler((error,_request,reply)=>{
    if(error instanceof ZodError) return reply.code(400).send({code:'INVALID_INPUT',message:'Verifique os dados informados',fields:error.issues.map((issue)=>({path:issue.path,message:issue.message}))});
    if(error instanceof DomainError) return reply.code(error.status).send({code:error.code,message:error.message});
    if(error instanceof Error && 'code' in error && error.code==='P0001') {const known=['ACCESS_REVOKED','INVALID_INVITATION','FORBIDDEN','INVALID_STATE'];if(known.includes(error.message)) return reply.code(error.message==='FORBIDDEN'||error.message==='ACCESS_REVOKED'?403:409).send({code:error.message,message:'Ação não permitida ou link inválido'});}
    return reply.code(500).send({code:'INTERNAL_ERROR',message:'Não foi possível concluir a operação'});
  });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    try { await pool.query('SELECT 1'); return { status: 'ready' }; }
    catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  if(auth) registerAuth(app,pool,auth);
  return app;
}
