import { PgBossQueue } from '@operaon/shared/queue';

// Processador sobe independente da API; handlers de negócio entram nas próximas sessões.
const queue = new PgBossQueue(process.env.QUEUE_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
await queue.start();
process.on('SIGTERM', () => { void queue.stop(); });
