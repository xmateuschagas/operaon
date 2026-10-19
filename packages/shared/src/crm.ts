import { z } from 'zod';
import { stageSchema, uuidSchema } from './index.js';

// Normalização não tenta adivinhar DDI; letras e números locais incompletos são rejeitados.
export function normalizePhone(value:string) {
  if(!/^\+?[\d\s().-]+$/.test(value.trim())) return '';
  const digits=value.replace(/\D/g,'');return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
}
const phone=z.string().transform(normalizePhone).refine((value)=>value.length>0,'Informe telefone com DDI');
export const lossReasons=['PRECO','SEM_RETORNO','TIMING','CONCORRENTE','OUTRO'] as const;
const nullableText=(max:number)=>z.string().trim().max(max).nullable().optional();
export const leadFields=z.object({
  nome:z.string().trim().min(1).max(150),empresa:nullableText(150),telefone_e164:phone,email:z.string().email().max(180).nullable().optional(),
  origem:z.string().trim().min(1).max(80),necessidade_resumo:z.string().trim().min(1),etapa:stageSchema.default('NOVO'),
  user_id:uuidSchema.optional(),product_id:uuidSchema.nullable().optional(),utm_source:nullableText(120),utm_campaign:nullableText(120),
  valor_estimado:z.number().nonnegative().max(9999999999.99).nullable().optional(),
  data_proximo_passo:z.string().datetime({offset:true}).nullable().optional(),descricao_proximo_passo:nullableText(255),
  motivo_perda:z.enum(lossReasons).nullable().optional(),motivo_perda_detalhe:z.string().trim().nullable().optional(),
  whatsapp_opt_in:z.boolean().default(false),
}).strict();
export const leadCreateSchema=leadFields.superRefine((lead,ctx)=>{
  if(!['GANHO','PERDIDO'].includes(lead.etapa)&&(!lead.data_proximo_passo||!lead.descricao_proximo_passo))ctx.addIssue({code:'custom',path:['data_proximo_passo'],message:'Defina data e descrição do próximo passo'});
  if(lead.etapa==='PERDIDO'&&!lead.motivo_perda)ctx.addIssue({code:'custom',path:['motivo_perda'],message:'Informe o motivo da perda'});
});
export const leadUpdateSchema=leadFields.partial().strict();
export const interactionSchema=z.object({canal:z.enum(['WhatsApp','Ligação','Reunião','E-mail']),resumo:z.string().trim().min(1),etapa:stageSchema.optional(),data_proximo_passo:z.string().datetime({offset:true}).nullable(),descricao_proximo_passo:z.string().trim().min(1).max(255).nullable(),motivo_perda:z.enum(lossReasons).optional(),motivo_perda_detalhe:z.string().trim().optional()}).strict();
export const templateSchema=z.object({etapa:stageSchema,nome:z.string().trim().min(1).max(100),corpo:z.string().trim().min(1).refine((text)=>[...text.matchAll(/\{([^}]+)\}/g)].every((match)=>['nome','empresa','necessidade'].includes(match[1]!)),'Use apenas {nome}, {empresa} e {necessidade}')}).strict();
