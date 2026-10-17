-- Estados OAuth globais: hash do state e verificador PKCE criptografado, nunca tokens puros.
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  verifier_enc TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  calendar BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
-- Consentimento Calendar é distinto do login básico e pertence à conexão da pessoa.
ALTER TABLE users ADD COLUMN google_calendar_authorized BOOLEAN NOT NULL DEFAULT FALSE;
GRANT SELECT,INSERT,UPDATE,DELETE ON oauth_states TO operaon_app;

-- Funções globais estreitas atravessam RLS apenas para identidade/onboarding. PUBLIC não pode executá-las.
CREATE FUNCTION operaon_login(sub TEXT, mail TEXT, full_name TEXT) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE person UUID; BEGIN
  INSERT INTO public.users(google_id,email,nome) VALUES(sub,lower(mail),full_name)
  ON CONFLICT(email) DO UPDATE SET nome=EXCLUDED.nome,google_id=EXCLUDED.google_id
  WHERE public.users.google_id IS NULL OR public.users.google_id=EXCLUDED.google_id RETURNING id INTO person;
  IF person IS NULL OR EXISTS(SELECT 1 FROM public.users WHERE id=person AND platform_status='BLOCKED') THEN RAISE EXCEPTION 'ACCESS_REVOKED' USING ERRCODE='P0001'; END IF;
  RETURN person;
END $$;
CREATE FUNCTION operaon_create_session(person UUID, digest TEXT, expiry TIMESTAMPTZ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM 1 FROM public.users WHERE id=person AND platform_status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_REVOKED'; END IF;
  INSERT INTO public.sessions(token_hash,user_id,expires_at) VALUES(digest,person,expiry);
END $$;
CREATE FUNCTION operaon_session(digest TEXT) RETURNS TABLE(user_id UUID,email VARCHAR,nome VARCHAR,active_tenant_id UUID,platform_status public.platform_status) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT u.id,u.email,u.nome,s.active_tenant_id,u.platform_status FROM public.sessions s JOIN public.users u ON u.id=s.user_id WHERE s.token_hash=digest AND s.expires_at>NOW() FOR SHARE OF u,s;
$$;
CREATE FUNCTION operaon_logout(digest TEXT) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  DELETE FROM public.sessions WHERE token_hash=digest;
$$;
CREATE FUNCTION operaon_workspaces(person UUID) RETURNS TABLE(id UUID,nome VARCHAR,timezone VARCHAR,lead_visibility public.lead_visibility,status public.access_status,member_status public.access_status,role public.member_role) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT t.id,t.nome,t.timezone,t.lead_visibility,t.status,m.status,m.role FROM public.tenant_members m JOIN public.tenants t ON t.id=m.tenant_id WHERE m.user_id=person ORDER BY m.created_at;
$$;
CREATE FUNCTION operaon_request_workspace(person UUID,title TEXT) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE workspace UUID; BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=person AND platform_status='ACTIVE') THEN RAISE EXCEPTION 'ACCESS_REVOKED'; END IF;
  INSERT INTO public.tenants(nome) VALUES(title) RETURNING id INTO workspace;
  INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES(workspace,person,'OWNER');
  UPDATE public.tenants SET default_owner_user_id=person WHERE id=workspace;
  INSERT INTO public.audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES(workspace,person,'tenants',workspace,'REQUEST');
  RETURN workspace;
END $$;
CREATE FUNCTION operaon_choose_workspace(digest TEXT,workspace UUID) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- Trava o vínculo durante a troca para não reativar contexto após bloqueio concorrente.
  IF workspace IS NOT NULL THEN
    PERFORM 1 FROM public.sessions s JOIN public.users u ON u.id=s.user_id JOIN public.tenant_members m ON m.user_id=u.id AND m.tenant_id=workspace JOIN public.tenants t ON t.id=m.tenant_id WHERE s.token_hash=digest AND s.expires_at>NOW() AND u.platform_status='ACTIVE' AND t.status='ACTIVE' AND m.status='ACTIVE' FOR SHARE OF u,m,t;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_REVOKED'; END IF;
  END IF;
  UPDATE public.sessions SET active_tenant_id=workspace WHERE token_hash=digest;
END $$;
CREATE FUNCTION operaon_save_google(person UUID,ciphertext TEXT,calendar_granted BOOLEAN) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  UPDATE public.users SET google_refresh_token_enc=COALESCE(ciphertext,google_refresh_token_enc),google_calendar_authorized=google_calendar_authorized OR calendar_granted WHERE id=person AND platform_status='ACTIVE';
$$;
CREATE FUNCTION operaon_approval_target(digest TEXT) RETURNS TABLE(tenant_id UUID,user_id UUID) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT a.tenant_id,a.user_id FROM public.approval_tokens a WHERE token_hash=digest AND used_at IS NULL AND expires_at>NOW() FOR UPDATE;
$$;
CREATE FUNCTION operaon_member_profiles() RETURNS TABLE(user_id UUID,email VARCHAR,nome VARCHAR,platform_status public.platform_status) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT u.id,u.email,u.nome,u.platform_status FROM public.users u JOIN public.tenant_members m ON m.user_id=u.id WHERE m.tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid;
$$;

-- Administração de plataforma fica restrita às funções verificando e-mail configurado pelo servidor.
CREATE FUNCTION operaon_platform_pending(actor UUID) RETURNS SETOF public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND email=current_setting('app.admin_email',true) AND platform_status='ACTIVE') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY SELECT * FROM public.tenants WHERE status='PENDING' ORDER BY created_at;
END $$;
CREATE FUNCTION operaon_platform_approve(actor UUID,workspace UUID) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND email=current_setting('app.admin_email',true) AND platform_status='ACTIVE') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.tenants SET status='ACTIVE' WHERE id=workspace AND status='PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  UPDATE public.tenant_members SET status='ACTIVE' WHERE tenant_id=workspace AND role='OWNER' AND status='PENDING';
  INSERT INTO public.audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES(workspace,actor,'tenants',workspace,'APPROVE');
END $$;
CREATE FUNCTION operaon_platform_block(actor UUID,person UUID) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND email=current_setting('app.admin_email',true) AND platform_status='ACTIVE') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.users SET platform_status='BLOCKED' WHERE id=person;
  DELETE FROM public.sessions WHERE user_id=person;
  INSERT INTO public.audit_log(user_id,entidade,entidade_id,acao) VALUES(actor,'users',person,'PLATFORM_BLOCK');
END $$;
CREATE FUNCTION operaon_clear_member_sessions(workspace UUID,person UUID) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF workspace::text IS DISTINCT FROM current_setting('app.tenant_id',true) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.sessions SET active_tenant_id=NULL WHERE user_id=person AND active_tenant_id=workspace;
END $$;
CREATE FUNCTION operaon_accept_invite(person UUID,digest TEXT) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE invitation public.invitations; mail TEXT; BEGIN
  SELECT email INTO mail FROM public.users WHERE id=person AND platform_status='ACTIVE';
  SELECT * INTO invitation FROM public.invitations WHERE token_hash=digest AND accepted_at IS NULL AND expires_at>NOW() FOR UPDATE;
  IF invitation.id IS NULL OR invitation.email IS DISTINCT FROM mail THEN RAISE EXCEPTION 'INVALID_INVITATION'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=invitation.tenant_id AND status='ACTIVE') OR EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=invitation.tenant_id AND user_id=person AND status='BLOCKED') THEN RAISE EXCEPTION 'ACCESS_REVOKED'; END IF;
  INSERT INTO public.tenant_members(tenant_id,user_id,role,status) VALUES(invitation.tenant_id,person,invitation.role,'ACTIVE')
  ON CONFLICT(tenant_id,user_id) DO UPDATE SET status='ACTIVE',role=CASE WHEN public.tenant_members.status='PENDING' THEN EXCLUDED.role ELSE public.tenant_members.role END;
  UPDATE public.invitations SET accepted_at=NOW() WHERE id=invitation.id;
  INSERT INTO public.audit_log(tenant_id,user_id,entidade,entidade_id,acao) VALUES(invitation.tenant_id,person,'invitations',invitation.id,'ACCEPT');
  RETURN invitation.tenant_id;
END $$;

-- Lista explícita: funções SECURITY DEFINER não ficam executáveis por qualquer conexão.
DO $$ DECLARE signature TEXT; BEGIN
  FOREACH signature IN ARRAY ARRAY['operaon_login(text,text,text)','operaon_create_session(uuid,text,timestamp with time zone)','operaon_session(text)','operaon_logout(text)','operaon_workspaces(uuid)','operaon_request_workspace(uuid,text)','operaon_choose_workspace(text,uuid)','operaon_save_google(uuid,text,boolean)','operaon_approval_target(text)','operaon_member_profiles()','operaon_platform_pending(uuid)','operaon_platform_approve(uuid,uuid)','operaon_platform_block(uuid,uuid)','operaon_clear_member_sessions(uuid,uuid)','operaon_accept_invite(uuid,text)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||signature||' TO operaon_app';
  END LOOP;
END $$;
