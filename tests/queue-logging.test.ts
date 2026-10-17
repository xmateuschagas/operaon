import { it,expect } from 'vitest';
import { instrumentQueue } from '../packages/shared/src/queue-logging.js';
import type { JobQueue } from '../packages/shared/src/queue.js';
// Instrumentação registra contexto validado, sem propagar mensagens livres ou tokens do payload/erro.
it('logs do worker contêm contexto e omitem credenciais/payloads inválidos',async()=>{
  let handler:((payload:unknown)=>Promise<void>)|undefined;const records:Record<string,unknown>[]=[];
  const queue:JobQueue={schedule:async()=>null,cancel:async()=>{},work:async(_name,run)=>{handler=run;}};
  const logged=instrumentQueue(queue,record=>records.push(record));await logged.work('test_job',async()=>{throw new Error('fixture-secret');});
  const tenantId=crypto.randomUUID();await expect(handler!({tenantId,userId:'fixture-secret',token:'fixture-secret'})).rejects.toThrow('fixture-secret');
  expect(records).toEqual([{event:'job_failed',job:'test_job',tenant_id:tenantId,user_id:null}]);expect(JSON.stringify(records)).not.toContain('fixture-secret');
});
