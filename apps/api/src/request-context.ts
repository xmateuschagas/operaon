import type { FastifyRequest } from 'fastify';
import { DomainError } from '@operaon/shared/errors';
// Contexto efêmero da requisição, nunca estado de sessão ou contador da réplica.
const chargedTenant=new WeakMap<FastifyRequest,string>();
export const bindQuotaTenant=(request:FastifyRequest,tenant:string)=>{chargedTenant.set(request,tenant);};
export function assertQuotaTenant(request:FastifyRequest,tenant:string|null){
  const expected=chargedTenant.get(request);if(expected&&expected!==tenant)throw new DomainError('WORKSPACE_CHANGED',409,'Workspace alterado durante a operação. Atualize a tela e tente novamente');
}
