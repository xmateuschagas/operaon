import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import { testPool,resetDatabase } from './database.js';
import { buildApp } from '../apps/api/src/app.js';
import { configSchema } from '../apps/api/src/config.js';
import type { GoogleAuth,GoogleIdentity } from '../apps/api/src/google-auth.js';
import { GoogleOAuth } from '../apps/api/src/google-auth.js';
import { encryptToken,decryptToken,hashToken } from '../packages/shared/src/security.js';
import { LogNotifier } from '../packages/shared/src/notifier.js';

const pool=testPool();
const config=configSchema.parse({APP_URL:'http://localhost:5173',ADMIN_EMAIL:'admin@example.invalid',SESSION_SECRET:'test-only-'.repeat(5),TOKEN_ENC_KEY:Buffer.alloc(32,7).toString('base64'),GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test-only',GOOGLE_REDIRECT_URI:'http://localhost:5173/api/auth/google/callback'});
class FakeGoogle implements GoogleAuth {
  identity:GoogleIdentity={sub:'test',email:'test@example.invalid',name:'Teste'};
  authorize(state:string,challenge:string,calendar:boolean) {return `https://example.invalid/auth?state=${state}&challenge=${challenge}&calendar=${calendar}`;}
  async exchange() {return this.identity;}
}
const google=new FakeGoogle();const log=vi.fn();
const app=buildApp(pool,{config,google,notifier:new LogNotifier(log)});
const origin={origin:'http://localhost:5173'};
const request=(url:string,cookie:string,body?:Record<string,unknown>,method:'GET'|'POST'|'PATCH'='POST')=>app.inject({url,method,headers:{...origin,cookie},payload:body});
async function login(email:string) {
  google.identity={sub:`sub-${email}`,email,name:email.split('@')[0]!,refreshToken:'fixture-refresh'};
  const start=await app.inject('/auth/google');
  const state=new URL(start.headers.location!).searchParams.get('state');
  const authCookie=String(start.headers['set-cookie']).split(';')[0]!;
  const result=await app.inject({url:`/auth/google/callback?code=fixture&state=${state}`,headers:{cookie:authCookie}});
  expect(result.statusCode).toBe(302);
  const cookies=result.headers['set-cookie'];const cookie=(Array.isArray(cookies)?cookies[0]!:String(cookies)).split(';')[0]!;
  const session=(await request('/session',cookie,undefined,'GET')).json();
  return {cookie,id:session.user.id as string};
}
async function workspace(ownerCookie:string,adminCookie:string) {
  const created=await request('/workspaces',ownerCookie,{nome:'Time de teste'});expect(created.statusCode).toBe(200);
  const id=created.json().id as string;
  expect((await request(`/platform/workspaces/${id}/approve`,adminCookie)).statusCode).toBe(200);
  expect((await request('/session/workspace',ownerCookie,{tenantId:id})).statusCode).toBe(200);
  return id;
}
beforeAll(async()=>{await resetDatabase(pool);});
beforeEach(async()=>{await resetDatabase(pool);log.mockClear();});
afterAll(async()=>{await app.close();await pool.end();});

// Testes reais de sessão, autorização e concorrência, sem contas Google/WhatsApp reais.
describe('identidade e isolamento',()=>{
  it('RN-17 mantém usuário global, onboarding e aprovação exclusiva da plataforma',async()=>{
    const owner=await login('owner@example.invalid');const admin=await login(config.ADMIN_EMAIL);
    const first=await request('/workspaces',owner.cookie,{nome:'Meu workspace'});const id=first.json().id;
    expect((await request('/session/workspace',owner.cookie,{tenantId:id})).json().code).toBe('USER_PENDING_APPROVAL');
    expect((await request(`/platform/workspaces/${id}/approve`,owner.cookie)).statusCode).toBe(403);
    expect((await request(`/platform/workspaces/${id}/approve`,admin.cookie)).statusCode).toBe(200);
    expect((await request('/session/workspace',owner.cookie,{tenantId:id})).statusCode).toBe(200);
    expect((await request('/session',owner.cookie,undefined,'GET')).json().workspaces).toHaveLength(1);
    expect((await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='tenant_id'")).rowCount).toBe(0);
    const duplicate=await login('owner@example.invalid');expect(duplicate.id).toBe(owner.id);
  });
  it('RN-21 consome convite uma vez, vincula e-mail e rejeita TTL expirado',async()=>{
    const owner=await login('owner@example.invalid');const admin=await login(config.ADMIN_EMAIL);const invited=await login('member@example.invalid');const wrong=await login('wrong@example.invalid');
    const tenant=await workspace(owner.cookie,admin.cookie);
    const invitation=(await request('/invitations',owner.cookie,{email:'member@example.invalid',role:'MEMBER'})).json();
    const token=new URL(invitation.link).searchParams.get('token')!;
    const stored=(await pool.query('SELECT * FROM invitations')).rows[0];expect(stored.token_hash).toBe(hashToken(token));expect(stored.token_hash).not.toBe(token);
    expect((await request('/invitations/accept',wrong.cookie,{token})).statusCode).toBe(409);
    const concurrent=await Promise.all([request('/invitations/accept',invited.cookie,{token}),request('/invitations/accept',invited.cookie,{token})]);
    expect(concurrent.map((response)=>response.statusCode).sort()).toEqual([200,409]);
    expect((await request('/session/workspace',invited.cookie,{tenantId:tenant})).statusCode).toBe(200);
    expect((await request('/invitations',invited.cookie,{email:'x@example.invalid'})).statusCode).toBe(403);
    const expired=(await request('/invitations',owner.cookie,{email:'wrong@example.invalid'})).json();const expiredToken=new URL(expired.link).searchParams.get('token')!;
    await pool.query("UPDATE invitations SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[expired.id]);
    expect((await request('/invitations/accept',wrong.cookie,{token:expiredToken})).statusCode).toBe(409);
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });
  it('RN-18 bloqueio local preserva outro workspace e global derruba todas as sessões',async()=>{
    const admin=await login(config.ADMIN_EMAIL);const owner=await login('owner@example.invalid');const person=await login('member@example.invalid');
    const first=await workspace(owner.cookie,admin.cookie);const second=await workspace(owner.cookie,admin.cookie);
    for(const tenant of [first,second]) {
      await pool.query("INSERT INTO tenant_members(tenant_id,user_id,status) VALUES($1,$2,'ACTIVE')",[tenant,person.id]);
    }
    await request('/session/workspace',person.cookie,{tenantId:first});await request('/session/workspace',owner.cookie,{tenantId:first});
    expect((await request(`/members/${person.id}/block`,owner.cookie)).statusCode).toBe(200);
    expect((await request('/session',person.cookie,undefined,'GET')).json().activeTenantId).toBeNull();
    expect((await request('/session/workspace',person.cookie,{tenantId:first})).statusCode).toBe(403);
    expect((await request('/session/workspace',person.cookie,{tenantId:second})).statusCode).toBe(200);
    const secondLogin=await login('member@example.invalid');
    expect((await request(`/platform/users/${person.id}/block`,admin.cookie)).statusCode).toBe(200);
    expect((await request('/session',person.cookie,undefined,'GET')).statusCode).toBe(401);
    expect((await request('/session',secondLogin.cookie,undefined,'GET')).statusCode).toBe(401);
    expect((await pool.query('SELECT * FROM sessions WHERE user_id=$1',[person.id])).rowCount).toBe(0);
    expect((await pool.query("SELECT acao FROM audit_log WHERE entidade_id=$1 AND acao IN ('BLOCK','PLATFORM_BLOCK')",[person.id])).rowCount).toBe(2);
    const start=await app.inject('/auth/google');const state=new URL(start.headers.location!).searchParams.get('state');
    expect((await app.inject({url:`/auth/google/callback?code=blocked&state=${state}`,headers:{cookie:String(start.headers['set-cookie']).split(';')[0]!}})).statusCode).toBe(403);
  });
  it('RN-22 recusa workspace alheio e CSRF, valida configurações locais',async()=>{
    const admin=await login(config.ADMIN_EMAIL);const owner=await login('owner@example.invalid');const stranger=await login('stranger@example.invalid');const id=await workspace(owner.cookie,admin.cookie);
    expect((await request('/session/workspace',stranger.cookie,{tenantId:id})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/workspaces',headers:{cookie:owner.cookie,origin:'https://evil.invalid'},payload:{nome:'Indevido'}})).statusCode).toBe(403);
    expect((await request('/workspace',owner.cookie,{timezone:'America/Manaus',lead_visibility:'compartilhado'},'PATCH')).statusCode).toBe(200);
    expect((await request('/workspace',owner.cookie,{timezone:'Invalido'},'PATCH')).statusCode).toBe(400);
    expect((await request(`/members/${owner.id}/block`,owner.cookie)).json().code).toBe('LAST_OWNER');
  });
  it('OAuth state é vinculado ao navegador e de uso único',async()=>{
    google.identity={sub:'oauth-person',email:'oauth@example.invalid',name:'OAuth'};
    const start=await app.inject('/auth/google');const state=new URL(start.headers.location!).searchParams.get('state');
    expect((await app.inject(`/auth/google/callback?code=fixture&state=${state}`)).statusCode).toBe(401);
    const headers={cookie:String(start.headers['set-cookie']).split(';')[0]!};
    expect((await app.inject({url:`/auth/google/callback?code=fixture&state=${state}`,headers})).statusCode).toBe(302);
    expect((await app.inject({url:`/auth/google/callback?code=fixture&state=${state}`,headers})).statusCode).toBe(401);
  });
  it('provider real pede escopo mínimo e rejeita e-mail não verificado',async()=>{
    const fake=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({access_token:'fixture'}))).mockResolvedValueOnce(new Response(JSON.stringify({sub:'x',email:'x@example.invalid',email_verified:false,name:'X'})));
    const provider=new GoogleOAuth(config,fake);const basic=new URL(provider.authorize('state','challenge',false));
    expect(basic.searchParams.get('scope')).toBe('openid email profile');
    expect(new URL(provider.authorize('state','challenge',true)).searchParams.get('scope')).toContain('calendar.app.created');
    await expect(provider.exchange('code','verifier')).rejects.toThrow();
  });
  it('RN-21 aprovação exige papel correto, expira e não pode ser reutilizada',async()=>{
    const owner=await login('owner@example.invalid');const admin=await login(config.ADMIN_EMAIL);
    const tenant=(await request('/workspaces',owner.cookie,{nome:'Pendente'})).json().id;
    const token='fixture-approval-'.repeat(3);
    await pool.query("INSERT INTO approval_tokens(tenant_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')",[tenant,hashToken(token)]);
    expect((await request('/approvals/consume',owner.cookie,{token})).statusCode).toBe(403);
    expect((await request('/approvals/consume',admin.cookie,{token})).statusCode).toBe(200);
    expect((await request('/approvals/consume',admin.cookie,{token})).statusCode).toBe(410);
    const expired='fixture-expired-'.repeat(3);
    await pool.query("INSERT INTO approval_tokens(tenant_id,token_hash,expires_at) VALUES($1,$2,NOW()-INTERVAL '1 second')",[tenant,hashToken(expired)]);
    expect((await request('/approvals/consume',admin.cookie,{token:expired})).statusCode).toBe(410);
  });
  it('RN-18/RN-21 convite não reativa vínculo bloqueado e sessão expirada não acessa',async()=>{
    const owner=await login('owner@example.invalid');const admin=await login(config.ADMIN_EMAIL);const person=await login('member@example.invalid');const tenant=await workspace(owner.cookie,admin.cookie);
    await pool.query("INSERT INTO tenant_members(tenant_id,user_id,status) VALUES($1,$2,'BLOCKED')",[tenant,person.id]);
    const invitation=(await request('/invitations',owner.cookie,{email:'member@example.invalid'})).json();const token=new URL(invitation.link).searchParams.get('token');
    expect((await request('/invitations/accept',person.cookie,{token})).statusCode).toBe(403);
    await pool.query("UPDATE sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=$1",[person.id]);
    expect((await request('/session',person.cookie,undefined,'GET')).statusCode).toBe(401);
    expect((await request('/logout',owner.cookie)).statusCode).toBe(200);
    expect((await request('/session',owner.cookie,undefined,'GET')).statusCode).toBe(401);
  });
  it('D33 consentimento incremental preserva refresh token se não houver novo',async()=>{
    const owner=await login('owner@example.invalid');const admin=await login(config.ADMIN_EMAIL);await workspace(owner.cookie,admin.cookie);
    const encrypted=(await pool.query('SELECT google_refresh_token_enc FROM users WHERE id=$1',[owner.id])).rows[0].google_refresh_token_enc;
    google.identity={sub:'sub-owner@example.invalid',email:'owner@example.invalid',name:'Owner',calendarAuthorized:true};
    const start=await app.inject({url:'/auth/google?calendar=true',headers:{cookie:owner.cookie}});expect(start.statusCode).toBe(302);
    const state=new URL(start.headers.location!).searchParams.get('state');const oauthCookie=String(start.headers['set-cookie']).split(';')[0]!;
    const result=await app.inject({url:`/auth/google/callback?code=incremental&state=${state}`,headers:{cookie:`${owner.cookie}; ${oauthCookie}`}});expect(result.statusCode).toBe(302);
    const saved=(await pool.query('SELECT google_refresh_token_enc,google_calendar_authorized FROM users WHERE id=$1',[owner.id])).rows[0];
    expect(saved.google_refresh_token_enc).toBe(encrypted);expect(saved.google_calendar_authorized).toBe(true);
    expect(decryptToken(saved.google_refresh_token_enc,config.TOKEN_ENC_KEY)).toBe('fixture-refresh');
  });
});
describe('AES-256-GCM',()=>{
  it('criptografa com nonce novo e autentica alterações',()=>{
    const first=encryptToken('fixture',config.TOKEN_ENC_KEY);const second=encryptToken('fixture',config.TOKEN_ENC_KEY);
    expect(first).not.toBe(second);expect(decryptToken(first,config.TOKEN_ENC_KEY)).toBe('fixture');
    const pieces=first.split('.');pieces[1]=Buffer.alloc(16,9).toString('base64url');
    expect(()=>decryptToken(pieces.join('.'),config.TOKEN_ENC_KEY)).toThrow();expect(()=>encryptToken('x','invalid')).toThrow();
  });
});
