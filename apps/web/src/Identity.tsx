import { useEffect,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { api,ApiError,type SessionView } from './api.js';

// Códigos da API permanecem estáveis; os rótulos apresentados são em português.
const roleLabel:Record<string,string>={OWNER:'Proprietário',ADMIN:'Administrador',MEMBER:'Membro'};
const statusLabel:Record<string,string>={PENDING:'Pendente',ACTIVE:'Ativo',BLOCKED:'Bloqueado'};

// Versão funcional básica da sessão 2; composição visual final entra na sessão 7a.
export function Identity() {
  const client=useQueryClient();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [nome,setNome]=useState('');
  const [pendingLink,setPendingLink]=useState(()=>{
    const params=new URLSearchParams(window.location.search);const token=params.get('token');const kind=window.location.pathname.includes('convite')?'invitation':'approval';
    if(token) sessionStorage.setItem('operaon_pending_link',JSON.stringify({kind,token}));
    try {return JSON.parse(sessionStorage.getItem('operaon_pending_link')??'null') as {kind:string;token:string}|null;} catch{return null;}
  });
  // Retirar o token da barra evita encaminhá-lo em referrers e capturas futuras.
  useEffect(()=>{if(window.location.search.includes('token='))window.history.replaceState({},'',window.location.pathname);},[]);
  const session=useQuery({queryKey:['session'],queryFn:()=>api<SessionView>('/session'),retry:false});
  const platform=useQuery({queryKey:['platform-pending'],queryFn:()=>api<{id:string;nome:string}[]>('/platform/workspaces'),enabled:session.data?.isPlatformAdmin===true});
  const active=session.data?.workspaces.find((workspace)=>workspace.id===session.data?.activeTenantId);
  const members=useQuery({queryKey:['members',active?.id],queryFn:()=>api<{user_id:string;nome:string;email:string;status:string;role:string}[]>('/members'),enabled:!!active&&active.role!=='MEMBER'});
  async function action(run:()=>Promise<unknown>) {
    setBusy(true);setMessage('');try {const result=await run();await client.invalidateQueries();setMessage(typeof result==='string'?result:'Alteração realizada');}catch(error){setMessage(error instanceof Error?error.message:'Falha ao concluir');}finally{setBusy(false);}
  }
  if(session.isPending)return <p role="status">Carregando sua sessão...</p>;
  if(session.error) return <section><h1>OperaON</h1>{session.error instanceof ApiError&&session.error.status===401?<><p>Entre com sua conta Google para continuar.</p><a href="/api/auth/google">Entrar com Google</a></>:<><p role="alert">{session.error.message}</p><button onClick={()=>void session.refetch()}>Tentar novamente</button></>}</section>;
  const data=session.data;
  return <section>
    <h1>OperaON</h1><p>{data.user.nome}</p>
    <button disabled={busy} onClick={()=>void action(async()=>{await api('/logout','POST');client.clear();})}>Sair</button>
    <label>Workspace<select value={data.activeTenantId??''} disabled={busy} onChange={(event)=>void action(async()=>{await api('/session/workspace','POST',{tenantId:event.target.value||null});client.clear();})}>
      <option value="">Selecione um workspace</option>{data.workspaces.filter((workspace)=>workspace.status==='ACTIVE'&&workspace.member_status==='ACTIVE').map((workspace)=><option key={workspace.id} value={workspace.id}>{workspace.nome}</option>)}
    </select></label>
    {message&&<p role="status">{message}</p>}
    {pendingLink&&<button disabled={busy} onClick={()=>void action(async()=>{await api(pendingLink.kind==='invitation'?'/invitations/accept':'/approvals/consume','POST',{token:pendingLink.token});sessionStorage.removeItem('operaon_pending_link');setPendingLink(null);})}>{pendingLink.kind==='invitation'?'Aceitar convite':'Aprovar solicitação'}</button>}
    {!active&&<><h2>Seus workspaces</h2>{data.workspaces.length===0?<p>Você pode solicitar um workspace ou aceitar um convite.</p>:<ul>{data.workspaces.map((workspace)=><li key={workspace.id}>{workspace.nome}: {workspace.status==='PENDING'||workspace.member_status==='PENDING'?'Aguardando liberação':workspace.member_status==='BLOCKED'?'Vínculo bloqueado':'Disponível'}</li>)}</ul>}
      <form onSubmit={(event)=>{event.preventDefault();void action(async()=>{await api('/workspaces','POST',{nome});setNome('');});}}><label>Nome do novo workspace<input required maxLength={150} value={nome} onChange={(event)=>setNome(event.target.value)}/></label><button disabled={busy}>Solicitar criação</button></form></>}
    {active&&<><h2>{active.nome}</h2><p>Workspace ativo. Fuso: {active.timezone}</p><a href="/api/auth/google?calendar=true">Autorizar agenda Google</a></>}
    {active&&active.role!=='MEMBER'&&<><h2>Acessos do workspace</h2>{members.isPending?<p>Carregando membros...</p>:members.error?<p role="alert">{members.error.message}</p>:<ul>{members.data?.map((member)=><li key={member.user_id}>{member.nome} ({roleLabel[member.role]}): {statusLabel[member.status]} {member.status==='PENDING'&&<button disabled={busy} onClick={()=>void action(()=>api(`/members/${member.user_id}/approve`,'POST'))}>Aprovar</button>}<button disabled={busy} onClick={()=>void action(()=>api(`/members/${member.user_id}/block`,'POST'))}>Bloquear vínculo</button></li>)}</ul>}
      <form onSubmit={(event)=>{event.preventDefault();const fields=new FormData(event.currentTarget);void action(async()=>{const result=await api<{link:string}>('/invitations','POST',{email:fields.get('email'),role:fields.get('role')});return `Convite criado: ${result.link}`;});}}><label>E-mail do convidado<input name="email" type="email" required/></label><label>Papel<select name="role"><option value="MEMBER">Membro</option><option value="ADMIN">Administrador</option><option value="OWNER">Proprietário</option></select></label><button disabled={busy}>Criar convite</button></form></>}
    {data.isPlatformAdmin&&<><h2>Workspaces aguardando aprovação</h2>{platform.error?<p role="alert">{platform.error.message}</p>:platform.isPending?<p>Carregando solicitações...</p>:platform.data?.length===0?<p>Nenhuma solicitação pendente.</p>:<ul>{platform.data?.map((workspace)=><li key={workspace.id}>{workspace.nome}<button disabled={busy} onClick={()=>void action(()=>api(`/platform/workspaces/${workspace.id}/approve`,'POST'))}>Aprovar workspace</button></li>)}</ul>}</>}
  </section>;
}
