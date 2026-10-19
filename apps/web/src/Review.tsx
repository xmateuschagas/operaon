import { useState } from 'react';
import { api } from './api.js';
import { utcInput,type Workspace } from './workspace.js';
import { useData,useRefresh,QueryState,Modal,formError,type LeadView } from './ui.js';
import { LeadCard } from './Execution.js';
import { NextStep } from './LeadForms.js';

// Revisão usa a consulta RN-03 do servidor; a tela não tenta recalcular inatividade com o fuso do computador.
export function Review({workspace}:{workspace:Workspace}){
  const query=useData<LeadView[]>(workspace,'/review');const refresh=useRefresh(workspace);const [reactivate,setReactivate]=useState<LeadView|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function action(path:string,body:unknown){setBusy(true);setError('');try{await api(path,'POST',body);await refresh();setReactivate(null);}catch(caught){setError(formError(caught));}finally{setBusy(false);}}
  return <><div className="panel"><h2>Retome as conversas que ficaram paradas</h2><p>Leads sem contato há mais de 7 dias. Quem nunca foi contatado conta a partir do cadastro. Leads em nutrição retornam após o prazo.</p></div>{error&&<p role="alert" className="error">{error}</p>}<QueryState query={query} empty={query.data?.length===0}>{query.data?.map(lead=><div className="review-item" key={lead.id}><LeadCard workspace={workspace} lead={lead}/><div className="review-actions"><button disabled={busy} onClick={()=>setReactivate(lead)}>Definir próximo passo</button><button disabled={busy} onClick={()=>void action(`/leads/${lead.id}/nurture`,{days:15})}>Nutrir 15 dias</button><button disabled={busy} onClick={()=>void action(`/leads/${lead.id}/nurture`,{days:30})}>Nutrir 30 dias</button></div></div>)}</QueryState>{reactivate&&<Modal title={`Reativar ${reactivate.nome}`} close={()=>setReactivate(null)}><form className="stack" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);try{void action(`/leads/${reactivate.id}/reactivate`,{descricao_proximo_passo:data.get('descricao_proximo_passo'),data_proximo_passo:utcInput(String(data.get('data_proximo_passo')),workspace.timezone)});}catch(caught){setError(formError(caught));}}}><NextStep stage="NOVO" timezone={workspace.timezone}/>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>Salvar próximo passo</button></form></Modal>}</>;
}

