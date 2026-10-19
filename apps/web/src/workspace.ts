import type { QueryClient } from '@tanstack/react-query';
import { api,type SessionView } from './api.js';

export type Workspace=SessionView['workspaces'][number];
export const canManage=(workspace:Workspace)=>workspace.role==='OWNER'||workspace.role==='ADMIN';
export const activeWorkspace=(session:SessionView)=>session.workspaces.find(workspace=>workspace.id===session.activeTenantId&&workspace.status==='ACTIVE'&&workspace.member_status==='ACTIVE');
export const workspaceKey=(tenant:string,path:string)=>['workspace',tenant,path] as const;
// Cancelar requisições e limpar dados antes de mudar a identidade do workspace evita quadros antigos na tela.
export async function changeWorkspace(client:QueryClient,tenantId:string|null,request:typeof api=api) {
  await client.cancelQueries();client.removeQueries({predicate:query=>query.queryKey[0]!=='session'});
  try {await request('/session/workspace','POST',{tenantId});}
  finally {const session=await request<SessionView>('/session');client.setQueryData(['session'],session);}
}
// Toda formatação usa o fuso do workspace, sem depender do computador de quem está operando.
export function localInput(value:string|Date,timezone:string) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const part=(name:string)=>parts.find(item=>item.type===name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function utcInput(value:string,timezone:string) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Informe data e horário');
  const nominal=Date.parse(`${value}:00Z`);let instant=nominal;
  for(let iteration=0;iteration<4;iteration++){const displayed=Date.parse(`${localInput(new Date(instant),timezone)}:00Z`);instant+=nominal-displayed;}
  if(!Number.isFinite(instant)||localInput(new Date(instant),timezone)!==value)throw new Error('Horário inexistente neste fuso');
  for(const minutes of [-120,-90,-60,-30,30,60,90,120])if(localInput(new Date(instant+minutes*60000),timezone)===value)throw new Error('Horário ambíguo neste fuso. Escolha outro horário');
  return new Date(instant).toISOString();
}
export const dateLabel=(value:string|Date|null|undefined,timezone:string)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:timezone}).format(new Date(value)):'Sem data';
