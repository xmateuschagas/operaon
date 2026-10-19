import { PgBossQueue } from '@operaon/shared/queue';
import { Pool } from 'pg';
import { deliverOutbox } from '@operaon/shared/jobs';
import { GoogleCalendar } from '@operaon/shared/google-calendar';
import { registerAgendaJobs } from '@operaon/shared/agenda-worker';
import { registerReminderJobs,recoverReminders } from '@operaon/shared/reminders';
import { WhatsAppClient } from '@operaon/shared/whatsapp';
import { workerHealth,watchWhatsApp } from '@operaon/shared/worker-health';
import { instrumentQueue } from '@operaon/shared/queue-logging';

// Processador sobe independente da API; handlers de negócio entram nas próximas sessões.
const queue = new PgBossQueue(process.env.QUEUE_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
queue.boss.on('error',()=>{process.stderr.write(`${JSON.stringify({event:'queue_error',tenant_id:null,user_id:null})}\n`);});
await queue.start();
const runtimeQueue=instrumentQueue(queue,record=>process.stdout.write(`${JSON.stringify(record)}\n`));
const pool=new Pool({connectionString:process.env.WORKER_DATABASE_URL??process.env.DATABASE_URL});
if(!process.env.TOKEN_ENC_KEY)throw new Error('Defina TOKEN_ENC_KEY para o worker');
await recoverReminders(pool);
await registerAgendaJobs(runtimeQueue,pool,process.env.TOKEN_ENC_KEY,new GoogleCalendar(process.env.GOOGLE_CLIENT_ID??'',process.env.GOOGLE_CLIENT_SECRET??''));
await registerReminderJobs(runtimeQueue,pool,new WhatsAppClient(process.env.WHATSAPP_API_URL??'',process.env.WHATSAPP_API_TOKEN??'',process.env.WHATSAPP_INSTANCE??''));
const health=workerHealth(pool,()=>queue.boss.getDb().executeSql('SELECT 1',[]),Number(process.env.HEALTH_PORT??3001));
const stopMonitor=watchWhatsApp(process.env.WHATSAPP_API_URL??'',process.env.WHATSAPP_API_TOKEN??'',process.env.WHATSAPP_INSTANCE??'',record=>process.stdout.write(`${JSON.stringify(record)}\n`));
// Dispatcher sem sobreposição local; múltiplas réplicas coordenam pela outbox e SKIP LOCKED.
let running=false;const timer=setInterval(()=>{if(running)return;running=true;void deliverOutbox(pool,runtimeQueue).catch(()=>{process.stderr.write(`${JSON.stringify({event:'outbox_delivery_failed',tenant_id:null,user_id:null})}\n`);}).finally(()=>{running=false;});},1000);
process.on('SIGTERM', () => {clearInterval(timer);stopMonitor();health.close();void queue.stop().then(()=>pool.end());});
