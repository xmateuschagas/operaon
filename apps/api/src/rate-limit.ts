import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { getCookie } from './auth-routes.js';
import { withSession } from './session.js';
import type { CrmDependencies } from './crm-routes.js';
import { takeWorkspaceQuota } from '@operaon/shared/request-limit';
import { bindQuotaTenant } from './request-context.js';

// Rotas globais preservam login, seletor e administração mesmo quando um workspace esgota sua quota.
const globalPaths=/^\/(auth(?:\/|$)|session(?:\/|$)|logout$|health$|ready$|platform(?:\/|$)|workspaces$|invitations\/accept$|approvals\/consume$|webhooks(?:\/|$))/;
export function registerLimits(app:FastifyInstance,pool:Pool,deps:CrmDependencies) {
  app.addHook('onRequest',async(request)=>{
    if(globalPaths.test(request.url.split('?')[0]!))return;
    const cookie=getCookie(request);if(!cookie)return;
    const tenant=await withSession(pool,cookie,deps.config,false,async(_db,actor)=>actor.active_tenant_id);
    if(!tenant)return;
    // Revalida vínculo antes de cobrar; a operação seguinte revalida novamente dentro da sua transação.
    const authorized=await withSession(pool,cookie,deps.config,true,async(_db,actor)=>actor.active_tenant_id!);
    await takeWorkspaceQuota(pool,authorized,deps.config.WORKSPACE_REQUESTS_PER_MINUTE,deps.now?.());
    bindQuotaTenant(request,authorized);
  });
}
