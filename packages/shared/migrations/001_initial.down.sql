-- Reverte somente o schema de aplicação desta migration, sem apagar a extensão compartilhada.
DROP TABLE audit_log, message_templates, appointment_reminders, appointments, lead_interactions, leads, products, approval_tokens, invitations, sessions;
-- Desfaz a referência circular do responsável padrão antes de remover os vínculos.
ALTER TABLE tenants DROP CONSTRAINT fk_default_owner;
DROP TABLE tenant_members, users, tenants;
DROP FUNCTION operaon_touch_updated_at();
-- Role pode estar associada a logins provisionados pela operação; é preservada sem grants nas tabelas removidas.
DROP TYPE reminder_status, reminder_type, sync_status, client_confirmation, appointment_status, loss_reason, lead_stage, lead_visibility, member_role, access_status, platform_status;
