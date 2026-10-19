import { useEffect,useRef,type ReactNode } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { workspaceKey,type Workspace } from './workspace.js';
import { ZodError } from 'zod';

export const stageLabels:Record<string,string>={NOVO:'Novo',CONTATO_INICIADO:'Contato iniciado',QUALIFICADO:'Qualificado',PROPOSTA_ENVIADA:'Proposta enviada',NEGOCIACAO:'Negociação',GANHO:'Ganho',PERDIDO:'Perdido'};
export const money=(value:number|string|null)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value??0));
export const formError=(error:unknown)=>error instanceof ZodError?'Confira os campos obrigatórios e os formatos informados':error instanceof Error?error.message:'Não foi possível concluir';
export function useData<T>(workspace:Workspace,path:string){return useQuery({queryKey:workspaceKey(workspace.id,path),queryFn:()=>api<T>(path),retry:false});}
export function useRefresh(workspace:Workspace){const client=useQueryClient();return ()=>client.invalidateQueries({queryKey:['workspace',workspace.id]});}
export function QueryState({query,empty,children}:{query:{isPending:boolean;error:Error|null;refetch:()=>unknown};empty?:boolean;children:ReactNode}){
  if(query.isPending)return <div className="state" role="status">Carregando informações...</div>;
  if(query.error)return <div className="state error" role="alert"><h2>Não foi possível carregar</h2><p>{query.error.message}</p><button onClick={()=>query.refetch()}>Tentar novamente</button></div>;
  if(empty)return <div className="state"><span className="empty-icon" aria-hidden="true">✓</span><h2>Tudo em dia por aqui</h2><p>Nenhum registro encontrado para esta seleção.</p></div>;
  return children;
}
// Dialog nativo contém foco e suporta Escape; restaurar foco ao fechar preserva navegação por teclado.
export function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const previous=document.activeElement;ref.current?.showModal();return ()=>{if(previous instanceof HTMLElement)previous.focus();};},[]);
  return <dialog ref={ref} onCancel={close} aria-label={title}><div className="dialog-heading"><h2>{title}</h2><button type="button" aria-label="Fechar janela" onClick={close}>×</button></div>{children}</dialog>;
}
export interface LeadView {id:string;nome:string;empresa:string|null;telefone_e164:string;email:string|null;origem:string;necessidade_resumo:string;etapa:string;valor_estimado:string|null;user_id:string;product_id:string|null;data_proximo_passo:string|null;descricao_proximo_passo:string|null;motivo_perda:string|null;whatsapp_opt_in:boolean;bucket?:string}
