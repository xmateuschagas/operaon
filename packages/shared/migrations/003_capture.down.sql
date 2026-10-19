-- Reverte a resolução restrita e as tabelas de captura sem tocar dados de outros módulos.
DROP FUNCTION operaon_resolve_integration(uuid,text,text);
DROP FUNCTION IF EXISTS operaon_lock_member(uuid);
DROP TABLE webhook_receipts,webhook_integrations;
