-- Diretório mínimo para o painel de bloqueio global, sem expor tokens Google ou dados de workspace.
CREATE FUNCTION operaon_platform_users(actor UUID) RETURNS TABLE(id UUID,nome VARCHAR,email VARCHAR,platform_status public.platform_status) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.email=current_setting('app.admin_email',true) AND u.platform_status='ACTIVE') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN QUERY SELECT u.id,u.nome,u.email,u.platform_status FROM public.users u ORDER BY u.created_at;
END $$;
REVOKE ALL ON FUNCTION operaon_platform_users(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operaon_platform_users(uuid) TO operaon_app;
