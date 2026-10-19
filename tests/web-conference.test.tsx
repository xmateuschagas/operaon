import { it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DailyQueue } from '../apps/web/src/Execution.js';
import { AppointmentForm,Agenda,type AppointmentView } from '../apps/web/src/Agenda.js';
import { workspaceKey,type Workspace } from '../apps/web/src/workspace.js';
import type { LeadView } from '../apps/web/src/ui.js';

const workspace:Workspace={id:crypto.randomUUID(),nome:'Conferência',timezone:'America/Sao_Paulo',lead_visibility:'proprios',status:'ACTIVE',member_status:'ACTIVE',role:'OWNER'};
const lead=(name:string,bucket:string,optIn=false):LeadView=>({id:crypto.randomUUID(),nome:name,empresa:null,telefone_e164:'5521999999999',email:null,origem:'Teste',necessidade_resumo:'Conferência',etapa:'NOVO',valor_estimado:null,user_id:crypto.randomUUID(),product_id:null,data_proximo_passo:'2026-10-19T15:00:00Z',descricao_proximo_passo:'Retornar',motivo_perda:null,whatsapp_opt_in:optIn,bucket});
function render(client:QueryClient,children:React.ReactNode){try{return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>);}finally{client.clear();}}

// Exercita a tela real e seu filtro inicial, não uma cópia da condição de filtragem.
it('D8 fila inicial mostra atrasados mais hoje e deixa próximos sete dias para filtro próprio',()=>{
  const client=new QueryClient();client.setQueryData(workspaceKey(workspace.id,'/queue'),{items:[lead('Vencido no mesmo dia','atrasados'),lead('Retorno de hoje','hoje'),lead('Futuro distante','proximos')],counts:{atrasados:1,hoje:1,proximos:1}});
  const html=render(client,<DailyQueue workspace={workspace}/>);
  expect(html).toContain('Vencido no mesmo dia');expect(html).toContain('Retorno de hoje');expect(html).not.toContain('Futuro distante');expect(html).toContain('badge late');expect(html).toMatch(/aria-pressed="true">Fila de hoje/);
});
it('D5/RN-09 aviso específico de falta de opt-in e D11 erro com ação de reprocessamento',()=>{
  const itemLead=lead('Sem consentimento','hoje');const client=new QueryClient();client.setQueryData(workspaceKey(workspace.id,'/leads'),[itemLead]);
  const item:AppointmentView={id:crypto.randomUUID(),lead_id:itemLead.id,lead_nome:itemLead.nome,titulo:'Conversa',descricao:null,local:null,start_time:'2026-10-20T15:00:00Z',end_time:'2026-10-20T16:00:00Z',status:'SCHEDULED',sync_status:'ERROR',confirmacao_cliente:'AGUARDANDO'};
  expect(render(client,<AppointmentForm workspace={workspace} item={item} done={()=>{}}/>)).toContain('Este lead não autorizou lembretes pelo WhatsApp');
  const agendaClient=new QueryClient();agendaClient.setQueryData(workspaceKey(workspace.id,'/appointments'),[item]);
  const html=render(agendaClient,<Agenda workspace={workspace}/>);expect(html).toContain('Erro no Google');expect(html).toContain('Reprocessar Google');
});
