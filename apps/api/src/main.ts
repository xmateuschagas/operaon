import { Pool } from 'pg';
import { buildApp } from './app.js';

// Cada réplica usa o mesmo Postgres e encerra conexões ao receber SIGTERM.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = buildApp(pool);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
process.on('SIGTERM', () => { void app.close().then(() => pool.end()); });
