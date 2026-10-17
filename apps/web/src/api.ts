// Erro de API preserva código estável para tratar sessão expirada e vínculo revogado.
export class ApiError extends Error { constructor(readonly code:string,message:string,readonly status:number,readonly details?:unknown){super(message);} }
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch(`/api${path}`,{method,credentials:'same-origin',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok) {
    if(path!=='/session'&&(response.status===401||['ACCESS_REVOKED','WORKSPACE_REQUIRED'].includes(data.code)))window.dispatchEvent(new Event('operaon:identity-changed'));
    throw new ApiError(data.code??'ERROR',data.message??'Não foi possível concluir',response.status,data.details);
  }
  return data as T;
}
export interface SessionView {
  user:{id:string;nome:string;email:string};isPlatformAdmin:boolean;activeTenantId:string|null;
  google?:{authorized:boolean;reauth_required:boolean};
  workspaces:{id:string;nome:string;timezone:string;lead_visibility:'proprios'|'compartilhado';status:string;member_status:string;role:'OWNER'|'ADMIN'|'MEMBER'}[];
}
