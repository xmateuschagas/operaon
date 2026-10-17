import type { Pool } from 'pg';
import { configSchema } from '../apps/api/src/config.js';
import type { AuthDependencies } from '../apps/api/src/auth-routes.js';
import { LogNotifier } from '../packages/shared/src/notifier.js';
import { opaqueToken,hashToken } from '../packages/shared/src/security.js';

// Contextos fictícios são inseridos por credencial de teste; o HTTP usa a role restrita normal.
export const testConfig=configSchema.parse({APP_URL:'http://localhost:5173',ADMIN_EMAIL:'platform@example.invalid',SESSION_SECRET:'test-fixture-'.repeat(4),TOKEN_ENC_KEY:Buffer.alloc(32,6).toString('base64'),GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',GOOGLE_REDIRECT_URI:'http://localhost:5173/api/auth/google/callback'});
export const authDeps:AuthDependencies={config:testConfig,google:{authorize(){throw new Error('Não usado nesta fixture');},async exchange(){throw new Error('Não usado nesta fixture');}},notifier:new LogNotifier(()=>{})};
export async function identity(pool:Pool,role:'OWNER'|'ADMIN'|'MEMBER'='OWNER',tenantId?:string) {
  const userId=crypto.randomUUID();const tenant=tenantId??crypto.randomUUID();const raw=opaqueToken();
  await pool.query('INSERT INTO users(id,nome,email) VALUES($1,$2,$3)',[userId,`Pessoa ${role}`,`${userId}@example.invalid`]);
  if(!tenantId)await pool.query("INSERT INTO tenants(id,nome,status) VALUES($1,'Workspace de teste','ACTIVE')",[tenant]);
  await pool.query("INSERT INTO tenant_members(tenant_id,user_id,role,status) VALUES($1,$2,$3,'ACTIVE')",[tenant,userId,role]);
  await pool.query("INSERT INTO sessions(token_hash,user_id,active_tenant_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 day')",[hashToken(raw),userId,tenant]);
  return {userId,tenantId:tenant,cookie:`operaon_session=${raw}`};
}
export const leadInput=(phone='5521999999999')=>({nome:'Lead de teste',telefone_e164:phone,origem:'Teste',necessidade_resumo:'Conhecer produto',data_proximo_passo:'2026-10-16T16:00:00Z',descricao_proximo_passo:'Retornar contato'});
