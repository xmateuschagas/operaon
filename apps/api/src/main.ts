import { Pool } from 'pg';
import { buildApp } from './app.js';
import { configSchema } from './config.js';
import { GoogleOAuth } from './google-auth.js';
import { WhatsAppClient,WhatsAppNotifier } from '@operaon/shared/whatsapp';
import { z } from 'zod';

// Cada réplica usa o mesmo Postgres e encerra conexões ao receber SIGTERM.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const config=configSchema.parse(process.env);
const recipients=z.record(z.string().regex(/^\d{8,15}$/)).parse(JSON.parse(process.env.NOTIFICATION_RECIPIENTS_JSON??'{}'));
const notifier=new WhatsAppNotifier(new WhatsAppClient(process.env.WHATSAPP_API_URL??'',process.env.WHATSAPP_API_TOKEN??'',process.env.WHATSAPP_INSTANCE??''),process.env.ADMIN_WHATSAPP??'',recipients,(record)=>{process.stdout.write(`${JSON.stringify(record)}\n`);});
const app = buildApp(pool,{config,google:new GoogleOAuth(config),notifier});
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
process.on('SIGTERM', () => { void app.close().then(() => pool.end()); });
