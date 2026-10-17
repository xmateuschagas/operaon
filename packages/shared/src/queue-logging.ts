import type { JobQueue } from './queue.js';
import { uuidSchema } from './index.js';
// Instrumentação conhece só contexto seguro; nunca registrar payload, telefone ou erro bruto do provedor.
export function instrumentQueue(queue:JobQueue,log:(record:Record<string,unknown>)=>void):JobQueue {
  return {
    schedule:(name,payload,options)=>queue.schedule(name,payload,options),cancel:(name,id)=>queue.cancel(name,id),
    work:async(name,handler)=>queue.work(name,async(payload)=>{
      const value=payload&&typeof payload==='object'?payload as Record<string,unknown>:{};
      const context={job:name,tenant_id:uuidSchema.safeParse(value.tenantId).success?value.tenantId:null,user_id:uuidSchema.safeParse(value.userId).success?value.userId:null};
      try{await handler(payload);log({event:'job_completed',...context});}catch(error){log({event:'job_failed',...context});throw error;}
    }),
  };
}
