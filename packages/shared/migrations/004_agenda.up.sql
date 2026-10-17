-- Outbox garante que salvar domínio e pedir processamento sejam uma única transação.
CREATE TABLE domain_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  kind VARCHAR(60) NOT NULL,
  payload JSONB NOT NULL,
  dedupe_key TEXT NOT NULL,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,dedupe_key)
);
CREATE INDEX idx_jobs_pending ON domain_jobs(tenant_id,created_at) WHERE delivered_at IS NULL;
GRANT SELECT,INSERT,UPDATE ON domain_jobs TO operaon_app;
ALTER TABLE domain_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON domain_jobs TO operaon_app USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
-- Worker tem descoberta estreita dos tenants com trabalho, sem SELECT global de dados de negócio.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='operaon_worker') THEN CREATE ROLE operaon_worker NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
GRANT operaon_app TO operaon_worker;
CREATE FUNCTION operaon_outbox_tenants() RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT DISTINCT tenant_id FROM public.domain_jobs WHERE delivered_at IS NULL;
$$;
REVOKE ALL ON FUNCTION operaon_outbox_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operaon_outbox_tenants() TO operaon_worker;

-- Revogação do refresh token é estado global da conexão, não de uma agenda isolada.
ALTER TABLE users ADD COLUMN google_reauth_required BOOLEAN NOT NULL DEFAULT FALSE;
CREATE FUNCTION operaon_google_connection(person UUID) RETURNS TABLE(ciphertext TEXT,authorized BOOLEAN,reauth_required BOOLEAN) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT u.google_refresh_token_enc,u.google_calendar_authorized,u.google_reauth_required FROM public.users u JOIN public.tenant_members m ON m.user_id=u.id JOIN public.tenants t ON t.id=m.tenant_id WHERE u.id=person AND m.tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND u.platform_status='ACTIVE' AND m.status='ACTIVE' AND t.status='ACTIVE';
$$;
CREATE FUNCTION operaon_google_status(person UUID) RETURNS TABLE(authorized BOOLEAN,reauth_required BOOLEAN) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT google_calendar_authorized,google_reauth_required FROM public.users WHERE id=person;
$$;
CREATE FUNCTION operaon_google_revoked(person UUID) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  UPDATE public.users SET google_reauth_required=true WHERE id=person AND EXISTS(SELECT 1 FROM public.tenant_members WHERE user_id=person AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
$$;
-- Preserva assinatura existente; consentimento incremental válido libera a conexão novamente.
CREATE OR REPLACE FUNCTION operaon_save_google(person UUID,ciphertext TEXT,calendar_granted BOOLEAN) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  UPDATE public.users SET google_refresh_token_enc=COALESCE(ciphertext,google_refresh_token_enc),google_calendar_authorized=google_calendar_authorized OR calendar_granted,google_reauth_required=CASE WHEN calendar_granted THEN false ELSE google_reauth_required END WHERE id=person AND platform_status='ACTIVE';
$$;
REVOKE ALL ON FUNCTION operaon_google_connection(uuid),operaon_google_status(uuid),operaon_google_revoked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operaon_google_connection(uuid),operaon_google_status(uuid),operaon_google_revoked(uuid) TO operaon_app;
-- Ordem de locks igual à API: pessoa, workspace, vínculo e depois compromisso.
CREATE FUNCTION operaon_lock_google_member(person UUID) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM 1 FROM public.users WHERE id=person AND platform_status='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_REVOKED'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND status='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_REVOKED'; END IF;
  PERFORM 1 FROM public.tenant_members WHERE tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND user_id=person AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_REVOKED'; END IF;
END $$;
REVOKE ALL ON FUNCTION operaon_lock_google_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operaon_lock_google_member(uuid) TO operaon_app;
