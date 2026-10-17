import PgBoss from 'pg-boss';

// Contrato de negócio independente de pg-boss/BullMQ e do formato do job id.
export interface QueueOptions { key: string; at?: Date; retries?: number }
export interface JobQueue {
  schedule(name: string, payload: Record<string, unknown>, options: QueueOptions): Promise<string | null>;
  cancel(name: string, id: string): Promise<void>;
  work(name: string, handler: (payload: unknown) => Promise<void>): Promise<void>;
}

// Apenas este adaptador conhece a biblioteca; handlers propagam erros para retry com backoff.
export class PgBossQueue implements JobQueue {
  readonly boss: PgBoss;
  constructor(connectionString: string) { this.boss = new PgBoss({ connectionString, retryLimit: 5, retryBackoff: true, retryDelay: 10 }); }
  async start() { await this.boss.start(); }
  async stop() { await this.boss.stop({ graceful: true, timeout: 5000 }); }
  async schedule(name: string, payload: Record<string, unknown>, options: QueueOptions) {
    await this.boss.createQueue(name, { name, policy: 'stately' });
    return this.boss.send(name, payload, { singletonKey: options.key, startAfter: options.at, retryLimit: options.retries ?? 5, retryBackoff: true });
  }
  async cancel(name: string, id: string) { await this.boss.cancel(name, id); }
  async work(name: string, handler: (payload: unknown) => Promise<void>) {
    await this.boss.createQueue(name, { name, policy: 'stately' });
    await this.boss.work(name, async (jobs) => { for (const job of jobs) await handler(job.data); });
  }
}
