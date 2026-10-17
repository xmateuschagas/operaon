import { it,expect,afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { buildApp } from '../apps/api/src/app.js';
import { testPool,resetDatabase } from './database.js';
import { identity,authDeps,testConfig } from './fixtures.js';
import { asApp } from '../apps/api/src/session.js';
import { Settings } from '../apps/web/src/Settings.js';
import { AppointmentForm,confirmationLabel } from '../apps/web/src/Agenda.js';
import { ImportLeads,rowLabel } from '../apps/web/src/Import.js';
import { workspaceKey,type Workspace } from '../apps/web/src/workspace.js';
const pool=testPool();const app=buildApp(pool,authDeps);
const workspace:Workspace={id:crypto.randomUUID(),nome:'Workspace de teste',timezone:'America/Sao_Paulo',lead_visibility:'proprios',role:'MEMBER',status:'ACTIVE',member_status:'ACTIVE'};
afterAll(async()=>{await app.close();await pool.end();});
function render(children:React.ReactNode){const client=new QueryClient();client.setQueryData(workspaceKey(workspace.id,'/templates'),[]);client.setQueryData(workspaceKey(workspace.id,'/leads'),[]);const result=renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>);client.clear();return result;}

// A lista global retorna apenas dados de administração, sem concessão de leitura de users à API.
it('RN-17/RN-18 diretório global é exclusivo do admin da plataforma e não expõe credenciais',async()=>{
  await resetDatabase(pool);const admin=await identity(pool);const local=await identity(pool);await pool.query('UPDATE users SET email=$2 WHERE id=$1',[admin.userId,testConfig.ADMIN_EMAIL]);
  expect((await app.inject({url:'/platform/users',headers:{cookie:local.cookie}})).statusCode).toBe(403);
  const result=await app.inject({url:'/platform/users',headers:{cookie:admin.cookie}});expect(result.statusCode).toBe(200);expect(Object.keys(result.json()[0]).sort()).toEqual(['email','id','nome','platform_status']);
  await expect(asApp(pool,testConfig,db=>db.query('SELECT * FROM users'))).rejects.toMatchObject({code:'42501'});
  await expect(asApp(pool,testConfig,db=>db.query('SELECT * FROM operaon_platform_users($1)',[local.userId]))).rejects.toMatchObject({message:'FORBIDDEN'});
});
it('RN-19 configurações e integrações só oferecem mutação a gestores',()=>{
  const member=render(<Settings workspace={workspace}/>);expect(member).not.toContain('Salvar workspace');expect(member).not.toContain('Criar integração');expect(member).toContain('Somente proprietários');
  const owner=render(<Settings workspace={{...workspace,role:'OWNER'}}/>);expect(owner).toContain('Salvar workspace');expect(owner).toContain('Criar integração de formulário');
  expect(render(<ImportLeads workspace={workspace}/>)).toContain('Somente proprietários');expect(rowLabel('duplicate')).toBe('Duplicada');
});
it('RN-13/RN-20/RN-22 agenda exige lead, usa fuso local e apresenta confirmação sem prometer sync de entrada',()=>{
  const html=render(<AppointmentForm workspace={workspace} done={()=>{}}/>);expect(html).toContain('name="lead_id" required=""');expect(html).toContain('America/Sao_Paulo');expect(html).toContain('agenda Google de quem o criou');expect(confirmationLabel('REMARCAR')).toBe('Pediu para remarcar');expect(confirmationLabel('CONFIRMADO')).toBe('Confirmado');
});
