// Erros de domínio expõem só código estável e mensagem segura em português.
export class DomainError extends Error {
  constructor(readonly code: string, readonly status = 400, message?: string,readonly details?:Record<string,unknown>) {
    const labels:Record<string,string>={UNAUTHENTICATED:'Entre com Google',FORBIDDEN:'Você não tem permissão para esta ação',WORKSPACE_REQUIRED:'Selecione um workspace',ACCESS_REVOKED:'Acesso bloqueado',USER_PENDING_APPROVAL:'Aguardando liberação',NOT_FOUND:'Registro não encontrado',INVALID_STATE:'O registro já foi alterado',INVALID_INVITATION:'Convite inválido ou expirado',CANNOT_BLOCK_SELF:'Você não pode bloquear sua própria conta'};
    super(message??labels[code]??'Não foi possível concluir a operação');
  }
}
