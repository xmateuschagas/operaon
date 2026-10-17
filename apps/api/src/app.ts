import Fastify from 'fastify';
import type { Pool } from 'pg';

// Factory separada do listener permite testar HTTP sem abrir porta.
export function buildApp(pool: Pool) {
  const app = Fastify({ logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'token', 'refresh_token'], serializers: { req: (req) => ({ method: req.method, url: String(req.url).split('?')[0] }) } } });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    try { await pool.query('SELECT 1'); return { status: 'ready' }; }
    catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  return app;
}
