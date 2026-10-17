import { it,expect,vi,afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { activeWorkspace,canManage,workspaceKey,changeWorkspace,localInput,utcInput,dateLabel,type Workspace } from '../apps/web/src/workspace.js';
import { api,type SessionView } from '../apps/web/src/api.js';
import { NextStep,LeadForm } from '../apps/web/src/LeadForms.js';

const workspace:Workspace={id:'10000000-0000-4000-8000-000000000001',nome:'Teste',timezone:'America/Sao_Paulo',lead_visibility:'proprios',status:'ACTIVE',member_status:'ACTIVE',role:'OWNER'};
const session:SessionView={user:{id:crypto.randomUUID(),nome:'Teste',email:'test@example.invalid'},isPlatformAdmin:false,activeTenantId:workspace.id,workspaces:[workspace]};
afterEach(()=>vi.unstubAllGlobals());
// Cache real do React Query prova que a troca não retém dados nem consultas em voo do tenant anterior.
it('RN-17/RN-22 troca de workspace cancela consultas e limpa dados antes da seleção',async()=>{
  const client=new QueryClient();client.setQueryData(workspaceKey(workspace.id,'/leads'),[{nome:'Segredo local'}]);let aborted=false;
  const pending=client.fetchQuery({queryKey:workspaceKey(workspace.id,'/slow'),queryFn:({signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'));});})}).catch(()=>{});
  const request=async<T,>(path:string)=>{expect(client.getQueryData(workspaceKey(workspace.id,'/leads'))).toBeUndefined();return (path==='/session'?session:{}) as T;};
  await changeWorkspace(client,workspace.id,request);await pending;expect(aborted).toBe(true);expect(client.getQueryData(['session'])).toEqual(session);client.clear();
});
it('RN-18 seletor ignora vínculo bloqueado/pendente; perda de autorização sinaliza limpeza',async()=>{
  expect(activeWorkspace(session)?.id).toBe(workspace.id);expect(activeWorkspace({...session,workspaces:[{...workspace,member_status:'BLOCKED'}]})).toBeUndefined();expect(activeWorkspace({...session,workspaces:[{...workspace,status:'PENDING'}]})).toBeUndefined();
  const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'ACCESS_REVOKED',message:'Acesso bloqueado'}),{status:403})));
  await expect(api('/leads')).rejects.toMatchObject({code:'ACCESS_REVOKED'});expect(dispatchEvent).toHaveBeenCalledOnce();
});
it('RN-19 tela oferece atribuição somente a OWNER/ADMIN',()=>{
  for(const role of ['OWNER','ADMIN','MEMBER'] as const){const ws={...workspace,role};const client=new QueryClient();client.setQueryData(workspaceKey(ws.id,'/products'),[]);client.setQueryData(workspaceKey(ws.id,'/members'),[]);
    const html=renderToStaticMarkup(<QueryClientProvider client={client}><LeadForm workspace={ws} done={()=>{}}/></QueryClientProvider>);expect(html.includes('name="user_id"')).toBe(canManage(ws));expect(html).toContain('Cliente autorizou');client.clear();}
});
it('RN-01/RN-05 formulário exige próximo passo em aberto e motivo ao perder',()=>{
  const open=renderToStaticMarkup(<NextStep stage="NOVO" timezone={workspace.timezone}/>);expect(open.match(/required=""/g)).toHaveLength(2);
  const won=renderToStaticMarkup(<NextStep stage="GANHO" timezone={workspace.timezone}/>);expect(won).not.toContain('required=""');
  const lost=renderToStaticMarkup(<NextStep stage="PERDIDO" timezone={workspace.timezone}/>);expect(lost).toContain('name="motivo_perda" required=""');
});
it('RN-22 converte e apresenta datas no fuso do workspace independente da máquina',()=>{
  expect(localInput('2026-10-17T01:30:00Z','America/Sao_Paulo')).toBe('2026-10-16T22:30');expect(utcInput('2026-10-16T22:30','America/Sao_Paulo')).toBe('2026-10-17T01:30:00.000Z');expect(dateLabel('2026-10-17T01:30:00Z','America/Sao_Paulo')).toContain('16/10/2026');
  expect(()=>utcInput('2026-03-08T02:30','America/New_York')).toThrow('inexistente');expect(()=>utcInput('2026-11-01T01:30','America/New_York')).toThrow('ambíguo');
});
