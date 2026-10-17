-- Extensão para gerar UUID dentro do banco
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Bloqueio global da pessoa, independente dos workspaces
CREATE TYPE platform_status AS ENUM ('ACTIVE', 'BLOCKED');
-- Aprovação do workspace e do vínculo, nunca do usuário global
CREATE TYPE access_status AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');
-- Papel dentro de um workspace
CREATE TYPE member_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
-- Modo de acesso a leads do workspace
CREATE TYPE lead_visibility AS ENUM ('proprios', 'compartilhado');
-- Etapas do funil de vendas
CREATE TYPE lead_stage AS ENUM ('NOVO','CONTATO_INICIADO','QUALIFICADO','PROPOSTA_ENVIADA','NEGOCIACAO','GANHO','PERDIDO');
-- Motivos padronizados de perda (permite medir depois)
CREATE TYPE loss_reason AS ENUM ('PRECO','SEM_RETORNO','TIMING','CONCORRENTE','OUTRO');
-- Situação do compromisso
CREATE TYPE appointment_status AS ENUM ('SCHEDULED','CONFIRMED','CANCELLED','COMPLETED');
-- Resposta do cliente ao lembrete do WhatsApp
CREATE TYPE client_confirmation AS ENUM ('AGUARDANDO','CONFIRMADO','REMARCAR');
-- Situação da sincronização com o Google
CREATE TYPE sync_status AS ENUM ('SYNCED','PENDING','ERROR');
-- Tipos de lembrete enviados
CREATE TYPE reminder_type AS ENUM ('INSTANT_CONFIRMATION','REMINDER_24H','REMINDER_1H');
-- Situação de cada lembrete
CREATE TYPE reminder_status AS ENUM ('PENDING','SENT','FAILED','CANCELLED');

-- Empresa dona dos dados (multi-tenant)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(150) NOT NULL,
  timezone VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  status access_status NOT NULL DEFAULT 'PENDING', -- aprovação do workspace pelo admin da plataforma
  lead_visibility lead_visibility NOT NULL DEFAULT 'proprios',
  default_owner_user_id UUID,             -- responsável padrão (RN-15); seed aponta para OWNER ativo; FK criada após tenant_members
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usuários que entram com Google
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,     -- identidade global, pode participar de vários workspaces
  google_id VARCHAR(100) UNIQUE,
  google_refresh_token_enc TEXT,          -- criptografado com AES-256-GCM, nunca em texto puro
  platform_status platform_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vínculo e permissões locais; uma agenda dedicada por pessoa/workspace
CREATE TABLE tenant_members (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role member_role NOT NULL DEFAULT 'MEMBER',
  status access_status NOT NULL DEFAULT 'PENDING',
  google_calendar_id VARCHAR(255),        -- "OperaON · <nome do workspace>"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

-- Sessões compartilhadas pelas réplicas; NULL permite onboarding e seletor
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,            -- cookie aleatório opaco; banco guarda apenas hash
  user_id UUID NOT NULL REFERENCES users(id),
  active_tenant_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,         -- TTL validado em toda requisição
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (active_tenant_id, user_id) REFERENCES tenant_members(tenant_id, user_id)
);
-- Permite invalidar todas as sessões em bloqueio global
CREATE INDEX idx_sessions_user ON sessions(user_id);
-- Permite limpar o workspace ativo no bloqueio de um vínculo
CREATE INDEX idx_sessions_workspace_user ON sessions(active_tenant_id, user_id);

-- Convites com papel concedido no workspace e consumo único
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(180) NOT NULL,
  role member_role NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);
-- Busca convites do workspace por destinatário
CREATE INDEX idx_invitations_email ON invitations(tenant_id, email);

-- Aprovação de workspace (user_id nulo) ou membro, com validade de 24h
CREATE TABLE approval_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_members(tenant_id, user_id)
);
-- Busca aprovações por workspace e membro
CREATE INDEX idx_approval_tokens_member ON approval_tokens(tenant_id, user_id);

-- Catálogo de produtos/serviços (EasyBread, PeguePagON, GEP, Site etc.)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  nome VARCHAR(120) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

-- Leads do funil
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),     -- responsável pelo lead
  product_id UUID REFERENCES products(id),        -- produto de interesse
  nome VARCHAR(150) NOT NULL,
  empresa VARCHAR(150),
  telefone_e164 VARCHAR(20) NOT NULL,             -- ex.: 5521999999999
  email VARCHAR(180),
  origem VARCHAR(80) NOT NULL,
  utm_source VARCHAR(120),
  utm_campaign VARCHAR(120),
  necessidade_resumo TEXT NOT NULL,
  etapa lead_stage NOT NULL DEFAULT 'NOVO',
  valor_estimado NUMERIC(12,2),
  data_ultimo_contato TIMESTAMPTZ,
  data_proximo_passo TIMESTAMPTZ,
  descricao_proximo_passo VARCHAR(255),
  nutricao_ate TIMESTAMPTZ,                       -- fora da revisão semanal até esta data
  motivo_perda loss_reason,
  motivo_perda_detalhe TEXT,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,                         -- exclusão lógica
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- RN-01: lead em aberto sempre tem próximo passo
  CONSTRAINT rn01_proximo_passo CHECK (
    etapa IN ('GANHO','PERDIDO')
    OR (data_proximo_passo IS NOT NULL AND descricao_proximo_passo IS NOT NULL)
  ),
  -- RN-05: perdido sempre tem motivo
  CONSTRAINT rn05_motivo_perda CHECK (etapa <> 'PERDIDO' OR motivo_perda IS NOT NULL)
);
-- RN-06: telefone único por empresa (ignorando excluídos)
CREATE UNIQUE INDEX uq_leads_telefone ON leads(tenant_id, telefone_e164) WHERE deleted_at IS NULL;
-- Acelera a fila diária
CREATE INDEX idx_leads_fila ON leads(tenant_id, user_id, data_proximo_passo) WHERE etapa NOT IN ('GANHO','PERDIDO') AND deleted_at IS NULL;
-- Acelera a revisão semanal: índice de expressão, igual à consulta da RN-03
CREATE INDEX idx_leads_inativos ON leads(tenant_id, user_id, (COALESCE(data_ultimo_contato, created_at))) WHERE etapa NOT IN ('GANHO','PERDIDO') AND deleted_at IS NULL;

-- Histórico de cada contato feito
CREATE TABLE lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  user_id UUID NOT NULL REFERENCES users(id),
  canal VARCHAR(30) NOT NULL,                     -- WhatsApp, Ligação, Reunião, E-mail
  resumo TEXT NOT NULL,
  etapa_momento lead_stage NOT NULL,
  proximo_passo_definido VARCHAR(255),            -- promessa feita nesta conversa
  data_agendada_passo TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compromissos (espelhados na agenda Google)
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  lead_id UUID NOT NULL REFERENCES leads(id),    -- RN-13: todo compromisso pertence a um lead (telefone e opt-in vêm dele)
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  local VARCHAR(255),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  google_event_id VARCHAR(255),
  sync_status sync_status NOT NULL DEFAULT 'PENDING',
  status appointment_status NOT NULL DEFAULT 'SCHEDULED',
  confirmacao_cliente client_confirmation NOT NULL DEFAULT 'AGUARDANDO',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT horario_valido CHECK (start_time < end_time)
);

-- Lembretes do WhatsApp
CREATE TABLE appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  reminder_type reminder_type NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status reminder_status NOT NULL DEFAULT 'PENDING',
  job_id VARCHAR(150),                            -- identificador do job retornado por JobQueue
  sent_at TIMESTAMPTZ,
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- RN-08: um lembrete de cada tipo por compromisso. Ao remarcar, a MESMA linha é atualizada
  -- (novo scheduled_for, status volta a PENDING, novo job_id); nunca se cria linha nova
  CONSTRAINT uq_lembrete UNIQUE (tenant_id, appointment_id, reminder_type)
);

-- Templates de mensagem por etapa
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  etapa lead_stage NOT NULL,
  nome VARCHAR(100) NOT NULL,
  corpo TEXT NOT NULL                             -- aceita {nome}, {empresa}, {necessidade}
);

-- Registro de ações sensíveis
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),         -- NULL apenas para ações globais da plataforma
  user_id UUID REFERENCES users(id),
  entidade VARCHAR(60) NOT NULL,
  entidade_id UUID,
  acao VARCHAR(60) NOT NULL,
  dados JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Integridade entre tenants: nenhuma FK de negócio pode apontar para outro workspace.
ALTER TABLE products ADD CONSTRAINT uq_products_tenant_id UNIQUE(tenant_id,id);
ALTER TABLE leads ADD CONSTRAINT uq_leads_tenant_id UNIQUE(tenant_id,id);
ALTER TABLE appointments ADD CONSTRAINT uq_appointments_tenant_id UNIQUE(tenant_id,id);
ALTER TABLE tenants ADD CONSTRAINT fk_default_owner FOREIGN KEY(id,default_owner_user_id) REFERENCES tenant_members(tenant_id,user_id);
ALTER TABLE leads ADD CONSTRAINT fk_lead_member FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_members(tenant_id,user_id);
ALTER TABLE leads ADD CONSTRAINT fk_lead_product FOREIGN KEY(tenant_id,product_id) REFERENCES products(tenant_id,id);
-- Telefone já normalizado, sem pontuação, com código de país (RN-06).
ALTER TABLE leads ADD CONSTRAINT ck_phone_e164 CHECK (telefone_e164 ~ '^[1-9][0-9]{7,14}$');
ALTER TABLE lead_interactions ADD CONSTRAINT fk_interaction_lead FOREIGN KEY(tenant_id,lead_id) REFERENCES leads(tenant_id,id);
ALTER TABLE lead_interactions ADD CONSTRAINT fk_interaction_member FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_members(tenant_id,user_id);
ALTER TABLE appointments ADD CONSTRAINT fk_appointment_lead FOREIGN KEY(tenant_id,lead_id) REFERENCES leads(tenant_id,id);
ALTER TABLE appointments ADD CONSTRAINT fk_appointment_member FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_members(tenant_id,user_id);
ALTER TABLE appointment_reminders ADD CONSTRAINT fk_reminder_appointment FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id);

-- Índices das consultas de workspace, inclusive modo compartilhado sem filtro de responsável.
CREATE INDEX idx_leads_shared_fila ON leads(tenant_id,data_proximo_passo) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_lead ON lead_interactions(tenant_id,lead_id,created_at);
CREATE INDEX idx_appointments_user_start ON appointments(tenant_id,user_id,start_time);
CREATE INDEX idx_reminders_pending ON appointment_reminders(tenant_id,status,scheduled_for);
CREATE INDEX idx_templates_stage ON message_templates(tenant_id,etapa);
CREATE INDEX idx_audit_created ON audit_log(tenant_id,created_at);

-- Atualização automática de timestamps em UTC (TIMESTAMPTZ armazena o instante).
CREATE FUNCTION operaon_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER touch_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION operaon_touch_updated_at();
CREATE TRIGGER touch_leads BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION operaon_touch_updated_at();
CREATE TRIGGER touch_appointments BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION operaon_touch_updated_at();

-- Role de execução sem login e sem privilégios de bypass. O login operacional herda esta role.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='operaon_app') THEN
    CREATE ROLE operaon_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO operaon_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON tenants,tenant_members,invitations,approval_tokens,products,leads,appointments,appointment_reminders,message_templates TO operaon_app;
-- Histórico e auditoria não são mutáveis pelo runtime.
GRANT SELECT,INSERT ON lead_interactions,audit_log TO operaon_app;

-- RLS nega sem contexto. FORCE também protege acessos acidentais da role proprietária não superuser.
DO $$ DECLARE tab TEXT; column_name TEXT; BEGIN
  FOREACH tab IN ARRAY ARRAY['tenants','tenant_members','invitations','approval_tokens','products','leads','lead_interactions','appointments','appointment_reminders','message_templates','audit_log'] LOOP
    column_name := CASE WHEN tab='tenants' THEN 'id' ELSE 'tenant_id' END;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO operaon_app USING (%I = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (%I = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',tab,column_name,column_name);
  END LOOP;
END $$;
