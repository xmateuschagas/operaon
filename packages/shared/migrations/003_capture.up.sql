-- Configuração local da integração: token puro só é apresentado uma vez ao gestor.
CREATE TABLE webhook_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL CHECK(kind IN ('FORM','WHATSAPP')),
  token_hash TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,id)
);
-- Recibo e resultado são persistidos na mesma transação dos efeitos do webhook.
CREATE TABLE webhook_receipts (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  integration_id UUID NOT NULL,
  external_id VARCHAR(200) NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(tenant_id,integration_id,external_id),
  FOREIGN KEY(tenant_id,integration_id) REFERENCES webhook_integrations(tenant_id,id)
);
CREATE INDEX idx_integrations_kind ON webhook_integrations(tenant_id,kind);
CREATE INDEX idx_receipts_created ON webhook_receipts(tenant_id,created_at);
GRANT SELECT,INSERT,UPDATE ON webhook_integrations,webhook_receipts TO operaon_app;
-- As duas tabelas seguem o mesmo contexto transacional RLS do restante do domínio.
DO $$ DECLARE tab TEXT; BEGIN
  FOREACH tab IN ARRAY ARRAY['webhook_integrations','webhook_receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO operaon_app USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',tab);
  END LOOP;
END $$;
-- Identificação não confia no payload: requer id, hash secreto, tipo e workspace aprovado.
CREATE FUNCTION operaon_resolve_integration(integration UUID,digest TEXT,expected_kind TEXT) RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT i.tenant_id FROM public.webhook_integrations i JOIN public.tenants t ON t.id=i.tenant_id WHERE i.id=integration AND i.token_hash=digest AND i.kind=expected_kind AND i.active=true AND t.status='ACTIVE';
$$;
REVOKE ALL ON FUNCTION operaon_resolve_integration(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operaon_resolve_integration(uuid,text,text) TO operaon_app;
-- Revalidação com lock impede escolher responsável que seja bloqueado durante a gravação.
CREATE FUNCTION operaon_lock_member(person UUID) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM 1 FROM public.users u JOIN public.tenant_members m ON m.user_id=u.id WHERE u.id=person AND m.tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND u.platform_status='ACTIVE' AND m.status='ACTIVE' FOR SHARE OF u,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_OWNER'; END IF;
END $$;
REVOKE ALL ON FUNCTION operaon_lock_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operaon_lock_member(uuid) TO operaon_app;
