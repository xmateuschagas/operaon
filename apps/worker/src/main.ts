import { PgBossQueue } from '@operaon/shared/queue';
import { Pool } from 'pg';
import { deliverOutbox } from '@operaon/shared/jobs';
import { GoogleCalendar } from '@operaon/shared/google-calendar';
import { registerAgendaJobs } from '@operaon/shared/agenda-worker';
import { registerReminderJobs } from '@operaon/shared/reminders';
import { WhatsAppClient } from '@operaon/shared/whatsapp';

// Processador sobe independente da API; handlers de negócio entram nas próximas sessões.
const queue = new PgBossQueue(process.env.QUEUE_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
queue.boss.on('error',()=>{process.stderr.write(`${JSON.stringify({event:'queue_error',tenant_id:null,user_id:null})}\n`);});
await queue.start();
const pool=new Pool({connectionString:process.env.WORKER_DATABASE_URL??process.env.DATABASE_URL});
if(!process.env.TOKEN_ENC_KEY)throw new Error('Defina TOKEN_ENC_KEY para o worker');
await registerAgendaJobs(queue,pool,process.env.TOKEN_ENC_KEY,new GoogleCalendar(process.env.GOOGLE_CLIENT_ID??'',process.env.GOOGLE_CLIENT_SECRET??''));
await registerReminderJobs(queue,pool,new WhatsAppClient(process.env.WHATSAPP_API_URL??'',process.env.WHATSAPP_API_TOKEN??'',process.env.WHATSAPP_INSTANCE??''));
// Dispatcher sem sobreposição local; múltiplas réplicas coordenam pela outbox e SKIP LOCKED.
let running=false;const timer=setInterval(()=>{if(running)return;running=true;void deliverOutbox(pool,queue).catch(()=>{process.stderr.write(`${JSON.stringify({event:'outbox_delivery_failed',tenant_id:null,user_id:null})}\n`);}).finally(()=>{running=false;});},1000);
process.on('SIGTERM', () => { clearInterval(timer);void queue.stop().then(()=>pool.end()); });
