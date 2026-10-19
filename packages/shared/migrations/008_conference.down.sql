-- Reversão remove somente os objetos introduzidos nesta sessão.
DROP FUNCTION operaon_reminder_tenants();
ALTER TABLE domain_jobs DROP COLUMN available_at;
ALTER TABLE appointments DROP COLUMN sync_next_attempt_at,DROP COLUMN sync_started_at,
  DROP COLUMN sync_attempts,DROP COLUMN sync_generation;
DROP TRIGGER immutable_lead_interactions ON lead_interactions;
DROP FUNCTION operaon_reject_interaction_mutation();
