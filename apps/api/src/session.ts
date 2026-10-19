import type { Pool, PoolClient } from 'pg';
import { DomainError } from '@operaon/shared/errors';
import { hashToken } from '@operaon/shared/security';
import type { AuthConfig } from './config.js';

export interface SessionPerson { user_id: string; email: string; nome: string; active_tenant_id: string | null; platform_status: 'ACTIVE' | 'BLOCKED' }
export interface Workspace { id: string; nome: string; timezone: string; lead_visibility: 'proprios' | 'compartilhado'; status: string; member_status: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' }
export interface Actor extends SessionPerson { workspace?: Workspace; isPlatformAdmin: boolean }

// Toda operação do runtime, inclusive global, troca para a role sem bypass.
export async function asApp<T>(pool: Pool, config: AuthConfig, run: (db: PoolClient) => Promise<T>) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN'); await db.query('SET LOCAL ROLE operaon_app');
    await db.query("SELECT set_config('app.admin_email',$1,true)",[config.ADMIN_EMAIL]);
    const result=await run(db); await db.query('COMMIT'); return result;
  } catch(error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

// Revalidar a sessão e o vínculo dentro da transação protege contra bloqueio entre requisições.
export async function withSession<T>(pool: Pool, raw: string | undefined, config: AuthConfig, tenantRequired: boolean, run: (db: PoolClient,actor: Actor) => Promise<T>) {
  if(!raw) throw new DomainError('UNAUTHENTICATED',401,'Entre com Google');
  return asApp(pool,config,async(db)=>{
    const session=(await db.query<SessionPerson>('SELECT * FROM operaon_session($1)',[hashToken(raw)])).rows[0];
    if(!session) throw new DomainError('UNAUTHENTICATED',401,'Sessão expirada');
    if(session.platform_status!=='ACTIVE') throw new DomainError('ACCESS_REVOKED',403,'Acesso bloqueado');
    const actor: Actor={...session,isPlatformAdmin:session.email===config.ADMIN_EMAIL};
    if(tenantRequired) {
      if(!session.active_tenant_id) throw new DomainError('WORKSPACE_REQUIRED',409,'Selecione um workspace');
      await db.query("SELECT set_config('app.tenant_id',$1,true)",[session.active_tenant_id]);
      const workspace=(await db.query<Workspace>('SELECT t.*,m.status AS member_status,m.role FROM tenants t JOIN tenant_members m ON m.tenant_id=t.id WHERE t.id=$1 AND m.user_id=$2 FOR SHARE OF t,m',[session.active_tenant_id,session.user_id])).rows[0];
      if(!workspace || workspace.member_status==='BLOCKED' || workspace.status==='BLOCKED') throw new DomainError('ACCESS_REVOKED',403,'Vínculo bloqueado');
      if(workspace.status!=='ACTIVE'||workspace.member_status!=='ACTIVE') throw new DomainError('USER_PENDING_APPROVAL',403,'Aguardando liberação');
      actor.workspace=workspace;
    }
    return run(db,actor);
  });
}
export function requireManager(actor: Actor) { if(!actor.workspace || actor.workspace.role==='MEMBER') throw new DomainError('FORBIDDEN',403,'Ação restrita ao administrador do workspace'); }
export function requirePlatform(actor: Actor) { if(!actor.isPlatformAdmin) throw new DomainError('FORBIDDEN',403,'Ação restrita ao administrador da plataforma'); }
