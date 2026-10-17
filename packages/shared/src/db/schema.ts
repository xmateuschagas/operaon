import { pgTable, pgEnum, uuid, varchar, text, timestamp, boolean, numeric, jsonb } from 'drizzle-orm/pg-core';

// Schema tipado; constraints, índices e RLS são aplicados pelas migrations SQL.
export const platform_statusEnum = pgEnum('platform_status', ['ACTIVE', 'BLOCKED']);
export const access_statusEnum = pgEnum('access_status', ['PENDING', 'ACTIVE', 'BLOCKED']);
export const member_roleEnum = pgEnum('member_role', ['OWNER', 'ADMIN', 'MEMBER']);
export const lead_visibilityEnum = pgEnum('lead_visibility', ['proprios', 'compartilhado']);
export const lead_stageEnum = pgEnum('lead_stage', ['NOVO','CONTATO_INICIADO','QUALIFICADO','PROPOSTA_ENVIADA','NEGOCIACAO','GANHO','PERDIDO']);
export const loss_reasonEnum = pgEnum('loss_reason', ['PRECO','SEM_RETORNO','TIMING','CONCORRENTE','OUTRO']);
export const appointment_statusEnum = pgEnum('appointment_status', ['SCHEDULED','CONFIRMED','CANCELLED','COMPLETED']);
export const client_confirmationEnum = pgEnum('client_confirmation', ['AGUARDANDO','CONFIRMADO','REMARCAR']);
export const sync_statusEnum = pgEnum('sync_status', ['SYNCED','PENDING','ERROR']);
export const reminder_typeEnum = pgEnum('reminder_type', ['INSTANT_CONFIRMATION','REMINDER_24H','REMINDER_1H']);
export const reminder_statusEnum = pgEnum('reminder_status', ['PENDING','SENT','FAILED','CANCELLED']);

// Colunas da tabela tenants; integridade referencial garantida no Postgres.
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: varchar('nome', { length: 150 }).notNull(),
  timezone: varchar('timezone', { length: 60 }).notNull().default('America/Sao_Paulo'),
  status: access_statusEnum('status').notNull().default('PENDING'),
  lead_visibility: lead_visibilityEnum('lead_visibility').notNull().default('proprios'),
  default_owner_user_id: uuid('default_owner_user_id'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Colunas da tabela users; integridade referencial garantida no Postgres.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: varchar('nome', { length: 150 }).notNull(),
  email: varchar('email', { length: 180 }).notNull(),
  google_id: varchar('google_id', { length: 100 }),
  google_refresh_token_enc: text('google_refresh_token_enc'),
  google_calendar_authorized: boolean('google_calendar_authorized').notNull().default(false),
  platform_status: platform_statusEnum('platform_status').notNull().default('ACTIVE'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Colunas da tabela tenant_members; integridade referencial garantida no Postgres.
export const tenant_members = pgTable('tenant_members', {
  tenant_id: uuid('tenant_id').notNull(),
  user_id: uuid('user_id').notNull(),
  role: member_roleEnum('role').notNull().default('MEMBER'),
  status: access_statusEnum('status').notNull().default('PENDING'),
  google_calendar_id: varchar('google_calendar_id', { length: 255 }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Colunas da tabela sessions; integridade referencial garantida no Postgres.
export const sessions = pgTable('sessions', {
  token_hash: text('token_hash').primaryKey(),
  user_id: uuid('user_id').notNull(),
  active_tenant_id: uuid('active_tenant_id'),
  expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Colunas da tabela invitations; integridade referencial garantida no Postgres.
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  email: varchar('email', { length: 180 }).notNull(),
  role: member_roleEnum('role').notNull(),
  token_hash: text('token_hash').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

// Colunas da tabela approval_tokens; integridade referencial garantida no Postgres.
export const approval_tokens = pgTable('approval_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  user_id: uuid('user_id'),
  token_hash: text('token_hash').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true, mode: 'date' }),
});

// Colunas da tabela products; integridade referencial garantida no Postgres.
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  nome: varchar('nome', { length: 120 }).notNull(),
  ativo: boolean('ativo').notNull().default(true),
});

// Colunas da tabela leads; integridade referencial garantida no Postgres.
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  user_id: uuid('user_id').notNull(),
  product_id: uuid('product_id'),
  nome: varchar('nome', { length: 150 }).notNull(),
  empresa: varchar('empresa', { length: 150 }),
  telefone_e164: varchar('telefone_e164', { length: 20 }).notNull(),
  email: varchar('email', { length: 180 }),
  origem: varchar('origem', { length: 80 }).notNull(),
  utm_source: varchar('utm_source', { length: 120 }),
  utm_campaign: varchar('utm_campaign', { length: 120 }),
  necessidade_resumo: text('necessidade_resumo').notNull(),
  etapa: lead_stageEnum('etapa').notNull().default('NOVO'),
  valor_estimado: numeric('valor_estimado', { precision: 12, scale: 2 }),
  data_ultimo_contato: timestamp('data_ultimo_contato', { withTimezone: true, mode: 'date' }),
  data_proximo_passo: timestamp('data_proximo_passo', { withTimezone: true, mode: 'date' }),
  descricao_proximo_passo: varchar('descricao_proximo_passo', { length: 255 }),
  nutricao_ate: timestamp('nutricao_ate', { withTimezone: true, mode: 'date' }),
  motivo_perda: loss_reasonEnum('motivo_perda'),
  motivo_perda_detalhe: text('motivo_perda_detalhe'),
  whatsapp_opt_in: boolean('whatsapp_opt_in').notNull().default(false),
  deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Colunas da tabela lead_interactions; integridade referencial garantida no Postgres.
export const lead_interactions = pgTable('lead_interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  lead_id: uuid('lead_id').notNull(),
  user_id: uuid('user_id').notNull(),
  canal: varchar('canal', { length: 30 }).notNull(),
  resumo: text('resumo').notNull(),
  etapa_momento: lead_stageEnum('etapa_momento').notNull(),
  proximo_passo_definido: varchar('proximo_passo_definido', { length: 255 }),
  data_agendada_passo: timestamp('data_agendada_passo', { withTimezone: true, mode: 'date' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Colunas da tabela appointments; integridade referencial garantida no Postgres.
export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  user_id: uuid('user_id').notNull(),
  lead_id: uuid('lead_id').notNull(),
  titulo: varchar('titulo', { length: 200 }).notNull(),
  descricao: text('descricao'),
  local: varchar('local', { length: 255 }),
  start_time: timestamp('start_time', { withTimezone: true, mode: 'date' }).notNull(),
  end_time: timestamp('end_time', { withTimezone: true, mode: 'date' }).notNull(),
  google_event_id: varchar('google_event_id', { length: 255 }),
  sync_status: sync_statusEnum('sync_status').notNull().default('PENDING'),
  status: appointment_statusEnum('status').notNull().default('SCHEDULED'),
  confirmacao_cliente: client_confirmationEnum('confirmacao_cliente').notNull().default('AGUARDANDO'),
  deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Colunas da tabela appointment_reminders; integridade referencial garantida no Postgres.
export const appointment_reminders = pgTable('appointment_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  appointment_id: uuid('appointment_id').notNull(),
  reminder_type: reminder_typeEnum('reminder_type').notNull(),
  scheduled_for: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull(),
  status: reminder_statusEnum('status').notNull().default('PENDING'),
  job_id: varchar('job_id', { length: 150 }),
  sent_at: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  error_log: text('error_log'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Colunas da tabela message_templates; integridade referencial garantida no Postgres.
export const message_templates = pgTable('message_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  etapa: lead_stageEnum('etapa').notNull(),
  nome: varchar('nome', { length: 100 }).notNull(),
  corpo: text('corpo').notNull(),
});

// Colunas da tabela audit_log; integridade referencial garantida no Postgres.
export const audit_log = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id'),
  user_id: uuid('user_id'),
  entidade: varchar('entidade', { length: 60 }).notNull(),
  entidade_id: uuid('entidade_id'),
  acao: varchar('acao', { length: 60 }).notNull(),
  dados: jsonb('dados'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
