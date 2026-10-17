-- Geração invalida jobs antigos; mensagem externa permite correlacionar respostas sem usar telefone sozinho.
ALTER TABLE appointment_reminders ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE appointment_reminders ADD COLUMN message_id TEXT;
CREATE UNIQUE INDEX idx_reminder_message ON appointment_reminders(tenant_id,message_id) WHERE message_id IS NOT NULL;
-- Limite de envio compartilhado entre workers, separado das quotas HTTP da sessão 8.
CREATE TABLE delivery_limits (
 tenant_id UUID NOT NULL REFERENCES tenants(id), window_start TIMESTAMPTZ NOT NULL, count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,window_start)
);
GRANT SELECT,INSERT,UPDATE ON delivery_limits TO operaon_app;
ALTER TABLE delivery_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON delivery_limits TO operaon_app USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
