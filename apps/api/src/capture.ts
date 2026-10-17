import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { leadCreateSchema,normalizePhone } from '@operaon/shared/crm';
import { DomainError } from '@operaon/shared/errors';
import type { Actor,Workspace } from './session.js';
import { createLead } from './leads.js';

interface Eligible {user_id:string;email:string;role:'OWNER'|'ADMIN'|'MEMBER';status:string;created_at:Date}
// RN-15 considera os dois níveis de bloqueio e a antiguidade do vínculo, não da pessoa global.
export async function responsible(db:PoolClient,explicitEmail?:string) {
  const people=(await db.query<Eligible>("SELECT m.*,p.email FROM tenant_members m JOIN operaon_member_profiles() p ON p.user_id=m.user_id WHERE m.status='ACTIVE' AND p.platform_status='ACTIVE' ORDER BY m.created_at,m.user_id")).rows;
  if(explicitEmail) {const person=people.find((item)=>item.email===explicitEmail.toLowerCase());if(!person)throw new DomainError('INVALID_OWNER',400,'Responsável deve ser membro ativo deste workspace');await db.query('SELECT operaon_lock_member($1)',[person.user_id]);return person;}
  const tenant=(await db.query<{default_owner_user_id:string|null}>('SELECT default_owner_user_id FROM tenants')).rows[0];
  const person=people.find((item)=>item.user_id===tenant?.default_owner_user_id)??people.find((item)=>item.role==='OWNER'||item.role==='ADMIN');
  if(!person)throw new DomainError('NO_RESPONSIBLE',503,'Workspace sem responsável ativo para receber leads');await db.query('SELECT operaon_lock_member($1)',[person.user_id]);return person;
}
export async function captureActor(db:PoolClient,tenantId:string):Promise<Actor> {
  const owner=await responsible(db);const workspace=(await db.query<Workspace>('SELECT * FROM tenants WHERE id=$1',[tenantId])).rows[0]!;
  return {user_id:owner.user_id,email:owner.email,nome:'Captura autorizada',platform_status:'ACTIVE',active_tenant_id:tenantId,isPlatformAdmin:false,workspace:{...workspace,role:'OWNER',member_status:'ACTIVE'}};
}
// Arquivo limitado no tamanho e em linhas; o servidor revalida na importação efetiva.
export const csvBody=z.object({csv:z.string().min(1).max(1000000)}).strict();
export interface CsvRow {line:number;status:'valid'|'duplicate'|'error';data?:Record<string,unknown>;message?:string}
export async function previewCsv(db:PoolClient,actor:Actor,csv:string,now:Date):Promise<CsvRow[]> {
  let records:Record<string,string>[];
  try {
    const header=csv.replace(/^\uFEFF/,'').split(/\r?\n/)[0]??'';
    records=parse(csv,{columns:true,bom:true,skip_empty_lines:true,trim:true,delimiter:header.includes(';')?';':',',max_record_size:100000}) as Record<string,string>[];
  } catch {throw new DomainError('INVALID_CSV',400,'CSV inválido. Confira cabeçalhos, aspas e separadores');}
  if(records.length>5000)throw new DomainError('CSV_TOO_LARGE',400,'Importe até 5000 linhas por arquivo');
  const result:CsvRow[]=[];const seen=new Set<string>();
  for(const [index,record] of records.entries()) {
    try {
      const owner=await responsible(db,record.responsavel_email?.trim()||undefined);
      const data=leadCreateSchema.parse({nome:record.nome,telefone_e164:record.telefone_e164??record.telefone,empresa:record.empresa||undefined,email:record.email||undefined,origem:record.origem||'Importação CSV',necessidade_resumo:record.necessidade||record.necessidade_resumo||'Não informada',user_id:owner.user_id,data_proximo_passo:new Date(now.getTime()+3600000).toISOString(),descricao_proximo_passo:'Primeiro contato',etapa:'NOVO',whatsapp_opt_in:false});
      const duplicate=seen.has(data.telefone_e164)||(await db.query('SELECT id FROM leads WHERE telefone_e164=$1 AND deleted_at IS NULL',[data.telefone_e164])).rowCount!==0;
      seen.add(data.telefone_e164);result.push({line:index+2,status:duplicate?'duplicate':'valid',data,message:duplicate?'Telefone já cadastrado ou repetido no arquivo':undefined});
    } catch(error) {
      if(error instanceof DomainError&&error.code==='NO_RESPONSIBLE')throw error;
      result.push({line:index+2,status:'error',message:error instanceof DomainError?error.message:'Verifique nome, telefone com DDI, e-mail e responsável'});
    }
  }
  return result;
}
export async function importCsv(db:PoolClient,actor:Actor,csv:string,now:Date) {
  const rows=await previewCsv(db,actor,csv,now);
  for(const row of rows)if(row.status==='valid') {
    // Savepoint permite relatar duplicidade concorrente sem deixar a transação inutilizável.
    await db.query('SAVEPOINT csv_row');
    try {await createLead(db,actor,row.data);await db.query('RELEASE SAVEPOINT csv_row');}
    catch(error) {
      await db.query('ROLLBACK TO SAVEPOINT csv_row');
      if(error instanceof DomainError&&error.code==='DUPLICATE_PHONE'||error instanceof Error&&'code' in error&&error.code==='23505') {row.status='duplicate';row.message='Telefone já cadastrado';}
      else throw error;
    }
  }
  return {created:rows.filter((row)=>row.status==='valid').length,duplicates:rows.filter((row)=>row.status==='duplicate').length,errors:rows.filter((row)=>row.status==='error').length,rows};
}
// Formulário não pode definir tenant, responsável, etapa ou origem arbitrariamente.
export const formSchema=z.object({nome:z.string().trim().min(1).max(150),telefone_e164:z.string().transform(normalizePhone).refine(Boolean,'Informe telefone com DDI'),empresa:z.string().max(150).optional(),email:z.string().email().optional(),necessidade_resumo:z.string().trim().min(1),utm_source:z.string().max(120).optional(),utm_campaign:z.string().max(120).optional(),product_id:z.string().uuid().optional(),whatsapp_opt_in:z.boolean().default(false)}).strict();
