-- Contador técnico por workspace/janela, compartilhado entre réplicas e protegido por RLS.
CREATE TABLE request_limits (
 tenant_id UUID NOT NULL REFERENCES tenants(id), window_start TIMESTAMPTZ NOT NULL, count INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,window_start)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON request_limits TO operaon_app;
ALTER TABLE request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON request_limits TO operaon_app USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
-- Retenção curta dos contadores técnicos não apaga entidades de negócio ou auditoria.
GRANT DELETE ON delivery_limits TO operaon_app;
