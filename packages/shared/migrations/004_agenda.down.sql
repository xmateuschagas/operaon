-- Restaura a implementação anterior antes de remover a coluna nova.
CREATE OR REPLACE FUNCTION operaon_save_google(person UUID,ciphertext TEXT,calendar_granted BOOLEAN) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  UPDATE public.users SET google_refresh_token_enc=COALESCE(ciphertext,google_refresh_token_enc),google_calendar_authorized=google_calendar_authorized OR calendar_granted WHERE id=person AND platform_status='ACTIVE';
$$;
DROP FUNCTION operaon_outbox_tenants(),operaon_google_connection(uuid),operaon_google_status(uuid),operaon_google_revoked(uuid),operaon_lock_google_member(uuid);
ALTER TABLE users DROP COLUMN google_reauth_required;
DROP TABLE domain_jobs;
-- Papel operacional permanece para não apagar logins/associações provisionados externamente.
