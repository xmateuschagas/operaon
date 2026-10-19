import { Component,useEffect,useState,type ReactNode } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { NavLink,Route,Routes,useLocation,Link } from 'react-router-dom';
import { api,type SessionView } from './api.js';
import { activeWorkspace,changeWorkspace,canManage } from './workspace.js';
import { Modal } from './ui.js';
import { Identity } from './Identity.js';
import { DailyQueue,Funnel,LeadDetail } from './Execution.js';
import { LeadForm } from './LeadForms.js';
import { Review } from './Review.js';
import { Agenda } from './Agenda.js';
import { Settings } from './Settings.js';
import { ImportLeads } from './Import.js';

const navigation=[['/fila','◷','Fila do dia'],['/funil','▥','Funil de vendas'],['/revisao','↻','Revisão semanal'],['/agenda','▦','Agenda'],['/acessos','♙','Acessos'],['/configuracoes','⚙','Configurações']];
const titles:Record<string,string>={'/fila':'Fila do dia','/funil':'Funil de vendas','/revisao':'Revisão semanal','/agenda':'Agenda','/acessos':'Acessos e workspaces','/configuracoes':'Configurações','/importar':'Importar leads'};
// Falhas inesperadas também têm recuperação, além dos estados explícitos de cada consulta.
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="state error" role="alert"><h1>Não foi possível abrir esta tela</h1><button onClick={()=>window.location.reload()}>Recarregar</button></div>:this.props.children;}
}
export function App(){
  const client=useQueryClient();const session=useQuery({queryKey:['session'],queryFn:()=>api<SessionView>('/session'),retry:false,refetchInterval:10000});const location=useLocation();
  const [switching,setSwitching]=useState(false);const [error,setError]=useState('');const [newLead,setNewLead]=useState(false);const active=session.data&&!session.error?activeWorkspace(session.data):undefined;
  useEffect(()=>{const listener=()=>{setSwitching(true);void client.cancelQueries().then(()=>{client.clear();return client.fetchQuery({queryKey:['session'],queryFn:()=>api<SessionView>('/session'),retry:false});}).catch(()=>{}).finally(()=>setSwitching(false));};window.addEventListener('operaon:identity-changed',listener);return ()=>window.removeEventListener('operaon:identity-changed',listener);},[client]);
  useEffect(()=>{setNewLead(false);client.removeQueries({predicate:query=>query.queryKey[0]==='workspace'&&query.queryKey[1]!==active?.id});},[active?.id,client]);
  if(switching)return <div className="state" role="status">Atualizando seu workspace...</div>;
  if(!active||!session.data||['/convite','/aprovar'].includes(location.pathname))return <div className="auth-screen"><Identity/>{active&&<Link className="button primary" to="/fila">Ir para o CRM</Link>}</div>;
  const data=session.data;const title=location.pathname.startsWith('/leads/')?'Detalhes do lead':titles[location.pathname]??'Fila do dia';
  async function select(tenantId:string|null){setSwitching(true);setError('');try{await changeWorkspace(client,tenantId);}catch(caught){setError(caught instanceof Error?caught.message:'Não foi possível selecionar');}finally{setSwitching(false);}}
  async function logout(){setSwitching(true);try{await api('/logout','POST');await client.cancelQueries();client.clear();}catch(caught){setError(caught instanceof Error?caught.message:'Não foi possível sair');}finally{setSwitching(false);}}
  return <div className="app-shell"><a className="skip" href="#conteudo">Pular para o conteúdo</a><aside className="sidebar"><Link className="brand" to="/fila">Opera<span>ON</span><small>por MicrotecON Sistemas Inteligentes</small></Link><label className="workspace-select">Workspace<select value={active.id} onChange={event=>void select(event.target.value||null)}><option value="">Selecionar workspace</option>{data.workspaces.filter(workspace=>workspace.status==='ACTIVE'&&workspace.member_status==='ACTIVE').map(workspace=><option key={workspace.id} value={workspace.id}>{workspace.nome}</option>)}</select></label><nav aria-label="Menu principal">{navigation.filter(([path])=>path!=='/acessos'||canManage(active)||data.isPlatformAdmin).map(([path,icon,label])=><NavLink key={path} to={path!}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</nav><div className="sidebar-user"><span className="avatar" aria-hidden="true">{data.user.nome.slice(0,2).toUpperCase()}</span><div><strong>{data.user.nome}</strong><small>{active.role==='OWNER'?'Proprietário':active.role==='ADMIN'?'Administrador':'Membro'}</small></div><button onClick={()=>void logout()}>Sair</button></div></aside>
    <div className="workspace-main"><header className="topbar"><div><h1>{title}</h1><p>{new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',timeZone:active.timezone}).format(new Date())}</p></div><div className="topbar-actions"><Link className="google-chip" to="/agenda">▦ {data.google?.reauth_required?'Reconectar Google':data.google?.authorized?'OperaON → Google':'Conectar agenda'}</Link><button className="primary" onClick={()=>setNewLead(true)}>+ Novo lead</button><button className="mobile-only" onClick={()=>void logout()}>Sair</button></div></header><main id="conteudo" className="content"><div className="workspace-context"><span>{active.nome}</span><small>{active.lead_visibility==='proprios'?'Visibilidade: próprios':'Visibilidade: compartilhada'} · {active.timezone}</small></div>{error&&<p className="error" role="alert">{error}</p>}<Routes><Route path="/revisao" element={<Review workspace={active}/>}/><Route path="/agenda" element={<Agenda workspace={active}/>}/><Route path="/configuracoes" element={<Settings key={active.id} workspace={active}/>}/><Route path="/importar" element={<ImportLeads workspace={active}/>}/><Route path="/funil" element={<Funnel workspace={active}/>}/><Route path="/leads/:id" element={<LeadDetail workspace={active}/>}/><Route path="/acessos" element={<div className="panel identity-panel"><Identity/></div>}/><Route path="/fila" element={<DailyQueue workspace={active}/>}/><Route path="*" element={<DailyQueue workspace={active}/>}/></Routes></main></div>
    {newLead&&<Modal title="Novo lead" close={()=>setNewLead(false)}><LeadForm workspace={active} done={()=>setNewLead(false)}/></Modal>}
  </div>;
}


