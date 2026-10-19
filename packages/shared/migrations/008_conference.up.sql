-- D22: defesa adicional mesmo quando uma role proprietária tenta alterar histórico.
CREATE FUNCTION operaon_reject_interaction_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'lead_interactions é imutável' USING ERRCODE='55000';
END $$;
CREATE TRIGGER immutable_lead_interactions BEFORE UPDATE OR DELETE ON lead_interactions
  FOR EACH ROW EXECUTE FUNCTION operaon_reject_interaction_mutation();

-- D11: estado de retry é do domínio e sobrevive a reinícios e mudanças de adaptador.
ALTER TABLE appointments ADD COLUMN sync_generation INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN sync_started_at TIMESTAMPTZ,
  ADD COLUMN sync_next_attempt_at TIMESTAMPTZ;
-- A outbox pode entregar imediatamente ao broker com startAfter persistido.
ALTER TABLE domain_jobs ADD COLUMN available_at TIMESTAMPTZ;

-- D14/D26: descoberta estreita, sem expor lembretes globais à API ou dispensar RLS no processamento.
CREATE FUNCTION operaon_reminder_tenants() RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT DISTINCT tenant_id FROM public.appointment_reminders WHERE status='PENDING';
$$;
REVOKE ALL ON FUNCTION operaon_reminder_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operaon_reminder_tenants() TO operaon_worker;
