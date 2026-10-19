import { beforeEach,afterAll,it,expect,vi } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { testPool,resetDatabase } from './database.js';
import { authDeps,identity,leadInput,testConfig } from './fixtures.js';
import { withTenant } from '../packages/shared/src/db/connection.js';
import { takeWorkspaceQuota } from '../packages/shared/src/request-limit.js';
import { watchWhatsApp,workerHealth } from '../packages/shared/src/worker-health.js';
import type { AddressInfo } from 'node:net';
const pool=testPool();const now=new Date('2026-10-16T15:00:00Z');const deps={...authDeps,config:{...testConfig,WORKSPACE_REQUESTS_PER_MINUTE:2},now:()=>now};const a=buildApp(pool,deps);const b=buildApp(pool,deps);
beforeEach(()=>resetDatabase(pool));afterAll(async()=>{await a.close();await b.close();await pool.end();});
it('RN-23 duas réplicas dividem quota, inclusive falhas, sem bloquear outro workspace ou seletor',async()=>{
  const owner=await identity(pool);const other=await identity(pool);
  expect((await a.inject({url:'/leads',headers:{cookie:owner.cookie}})).statusCode).toBe(200);
  expect((await b.inject({url:'/leads',method:'POST',headers:{cookie:owner.cookie,origin:testConfig.APP_URL},payload:{}})).statusCode).toBe(400);
  const rejected=await a.inject({url:'/leads',headers:{cookie:owner.cookie}});expect(rejected.statusCode).toBe(429);expect(rejected.headers['retry-after']).toBe('60');
  expect((await b.inject({url:'/session',headers:{cookie:owner.cookie}})).statusCode).toBe(200);expect((await b.inject({url:'/leads',headers:{cookie:other.cookie}})).statusCode).toBe(200);
  await expect(takeWorkspaceQuota(pool,owner.tenantId,2,new Date(now.getTime()+60000))).resolves.toBeUndefined();
});
it('RN-18 bloqueio em uma réplica revoga sessão nas outras e preserva isolamento no pool',async()=>{
  const owner=await identity(pool);const member=await identity(pool,'MEMBER',owner.tenantId);
  expect((await a.inject({url:'/leads',headers:{cookie:member.cookie}})).statusCode).toBe(200);
  expect((await b.inject({url:`/members/${member.userId}/block`,method:'POST',headers:{cookie:owner.cookie,origin:testConfig.APP_URL}})).statusCode).toBe(200);
  const session=(await a.inject({url:'/session',headers:{cookie:member.cookie}})).json();expect(session.activeTenantId).toBeNull();expect((await a.inject({url:'/leads',headers:{cookie:member.cookie}})).statusCode).toBe(409);
  const value=await pool.query("SELECT NULLIF(current_setting('app.tenant_id',true),'') AS tenant,current_user AS role");expect(value.rows[0].tenant).toBeNull();expect(value.rows[0].role).not.toBe('operaon_app');
});
it('RN-22/RN-23 quota de webhook é agregada entre réplicas e reentrega mantém o mesmo lead',async()=>{
  const owner=await identity(pool);const app=buildApp(pool,{...deps,config:{...deps.config,WORKSPACE_REQUESTS_PER_MINUTE:20}});
  try{const integration=(await app.inject({url:'/integrations/form',method:'POST',headers:{cookie:owner.cookie,origin:testConfig.APP_URL},payload:{}})).json();
    const input={url:`/webhooks/leads/${integration.id}`,method:'POST' as const,headers:{authorization:`Bearer ${integration.token}`,'x-event-id':'same-event'},payload:{nome:'Webhook',telefone_e164:leadInput().telefone_e164,necessidade_resumo:'Teste'}};
    const first=await a.inject(input);expect(first.statusCode).toBe(201);const again=await b.inject(input);expect(again.statusCode).toBe(429);
    // Uma nova janela permite reentrega, sem recriar o lead ou trocar o resultado original.
    await pool.query('DELETE FROM request_limits WHERE tenant_id=$1',[owner.tenantId]);const replay=await b.inject(input);expect(replay.json()).toEqual(first.json());expect((await pool.query('SELECT * FROM leads')).rowCount).toBe(1);
    await expect(withTenant(pool,crypto.randomUUID(),db=>db.query('SELECT * FROM request_limits'))).resolves.toMatchObject({rowCount:0});
  }finally{await app.close();}
});
it('worker separa health/readiness e alerta WhatsApp sem dados de credenciais',async()=>{
  const unavailable={query:async()=>{throw new Error('offline');}} as unknown as typeof pool;const server=workerHealth(unavailable,async()=>{},0);await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as AddressInfo).port;
  try{expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);expect((await fetch(`http://127.0.0.1:${port}/ready`)).status).toBe(503);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  const log=vi.fn();const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({connected:false})));const stop=watchWhatsApp('https://bridge.invalid','fixture-token','operaon',log,fetcher);await vi.waitFor(()=>expect(log).toHaveBeenCalledOnce());stop();expect(log.mock.calls[0]?.[0]).toEqual({event:'whatsapp_disconnected',tenant_id:null,user_id:null});
});
it('RN-22/RN-23 troca concorrente de workspace não executa operação em tenant diferente da quota',async()=>{
  const owner=await identity(pool);const second=await identity(pool);await pool.query("INSERT INTO tenant_members(tenant_id,user_id,role,status) VALUES($1,$2,'OWNER','ACTIVE')",[second.tenantId,owner.userId]);
  const app=buildApp(pool,deps);app.addHook('preHandler',async(request)=>{if(request.url==='/leads')await pool.query('UPDATE sessions SET active_tenant_id=$2 WHERE user_id=$1',[owner.userId,second.tenantId]);});
  try{const result=await app.inject({url:'/leads',headers:{cookie:owner.cookie}});expect(result.statusCode).toBe(409);expect(result.json().code).toBe('WORKSPACE_CHANGED');}finally{await app.close();}
});
