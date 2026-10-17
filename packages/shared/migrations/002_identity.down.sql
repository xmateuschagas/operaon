-- Remove operações restritas antes de remover seu armazenamento de estado OAuth.
DROP FUNCTION operaon_login(text,text,text),operaon_create_session(uuid,text,timestamp with time zone),operaon_session(text),operaon_logout(text),operaon_workspaces(uuid),operaon_request_workspace(uuid,text),operaon_choose_workspace(text,uuid),operaon_save_google(uuid,text,boolean),operaon_approval_target(text),operaon_member_profiles(),operaon_platform_pending(uuid),operaon_platform_approve(uuid,uuid),operaon_platform_block(uuid,uuid),operaon_clear_member_sessions(uuid,uuid),operaon_accept_invite(uuid,text);
DROP TABLE oauth_states;
ALTER TABLE users DROP COLUMN google_calendar_authorized;
