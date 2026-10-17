import { Pool } from 'pg';
import { buildApp } from './app.js';
import { configSchema } from './config.js';
import { GoogleOAuth } from './google-auth.js';
import { LogNotifier } from '@operaon/shared/notifier';

// Cada réplica usa o mesmo Postgres e encerra conexões ao receber SIGTERM.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const config=configSchema.parse(process.env);
const app = buildApp(pool,{config,google:new GoogleOAuth(config),notifier:new LogNotifier((record)=>{ process.stdout.write(`${JSON.stringify(record)}\n`); })});
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
process.on('SIGTERM', () => { void app.close().then(() => pool.end()); });
