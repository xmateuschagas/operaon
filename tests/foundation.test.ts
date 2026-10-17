import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { testPool, resetDatabase } from './database.js';
import { migrate } from '../packages/shared/src/db/migrate.js';
import { seed, seedTenant, seedUser } from '../packages/shared/src/db/seed.js';
import { withTenant } from '../packages/shared/src/db/connection.js';
import { PgBossQueue } from '../packages/shared/src/queue.js';
import { buildApp } from '../apps/api/src/app.js';

const pool = testPool();
const other = '10000000-0000-4000-8000-000000000002';

// Exercita constraints reais e pool com role restrita, em vez de simular SQL.
beforeAll(async () => {
  await resetDatabase(pool); await migrate(pool,'down'); await migrate(pool); await seed(pool);
  await pool.query("INSERT INTO tenants(id,nome,status) VALUES ($1,'Outro workspace','ACTIVE')",[other]);
  await pool.query("INSERT INTO tenant_members(tenant_id,user_id,status,role) VALUES ($1,$2,'ACTIVE','OWNER')",[other,seedUser]);
});
afterAll(async () => { await pool.end(); });
describe('integridade do MVP', () => {
  const insert = (extra: string) => withTenant(pool, seedTenant, (db) => db.query(`INSERT INTO leads(tenant_id,user_id,nome,telefone_e164,origem,necessidade_resumo,etapa) VALUES ($1,$2,'Teste','5521888888888','Teste','Teste',${extra})`,[seedTenant,seedUser]));
  it('RN-01 impede lead aberto sem próximo passo',async () => { await expect(insert("'NOVO'")).rejects.toMatchObject({ code:'23514',constraint:'rn01_proximo_passo' }); });
  it('RN-05 impede perdido sem motivo',async () => { await expect(insert("'PERDIDO'")).rejects.toMatchObject({ code:'23514',constraint:'rn05_motivo_perda' }); });
  it('RN-06 deduplica no workspace e permite mesmo telefone em outro',async () => {
    const sql="INSERT INTO leads(tenant_id,user_id,nome,telefone_e164,origem,necessidade_resumo,etapa) VALUES ($1,$2,'Teste','5521888888888','Teste','Teste','GANHO')";
    await withTenant(pool,seedTenant,(db)=>db.query(sql,[seedTenant,seedUser]));
    await expect(withTenant(pool,seedTenant,(db)=>db.query(sql,[seedTenant,seedUser]))).rejects.toMatchObject({code:'23505'});
    await withTenant(pool,other,(db)=>db.query(sql,[other,seedUser]));
  });
  it('RN-22 isola leitura, escrita e referências entre workspaces',async () => {
    const rows=await withTenant(pool,other,(db)=>db.query('SELECT * FROM leads WHERE tenant_id=$1',[seedTenant]));
    expect(rows.rowCount).toBe(0);
    await expect(withTenant(pool,other,(db)=>db.query("INSERT INTO products(tenant_id,nome) VALUES ($1,'Inválido')",[seedTenant]))).rejects.toMatchObject({code:'42501'});
    const product=(await pool.query('SELECT id FROM products WHERE tenant_id=$1 LIMIT 1',[seedTenant])).rows[0];
    await expect(withTenant(pool,other,(db)=>db.query("INSERT INTO leads(tenant_id,user_id,product_id,nome,telefone_e164,origem,necessidade_resumo,etapa) VALUES ($1,$2,$3,'Cruzado','5521777777777','Teste','Teste','GANHO')",[other,seedUser,product.id]))).rejects.toMatchObject({code:'23503'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE operaon_app');
      expect((await client.query('SELECT * FROM leads')).rowCount).toBe(0);
      await client.query('ROLLBACK');
    } finally { client.release(); }
  });
  it('seed é repetível e contém lead nunca contatado inativo',async () => {
    await seed(pool);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM products WHERE tenant_id=$1',[seedTenant])).rows[0].n).toBe(4);
    expect((await pool.query("SELECT id FROM leads WHERE data_ultimo_contato IS NULL AND created_at < NOW()-INTERVAL '7 days'")).rowCount).toBeGreaterThan(0);
  });
  it('healthcheck e readiness são rotas separadas',async () => {
    const app=buildApp(pool);
    try {
      expect((await app.inject({url:'/health'})).json()).toEqual({status:'ok'});
      expect((await app.inject({url:'/ready'})).json()).toEqual({status:'ready'});
    } finally { await app.close(); }
  });
  it('JobQueue persiste agendamento, deduplicação e cancelamento',async () => {
    const queue=new PgBossQueue(process.env.TEST_DATABASE_URL!);
    try {
      await queue.start();
      const key=crypto.randomUUID();
      const name=`contract-${key}`;
      const id=await queue.schedule(name,{tenant_id:seedTenant},{key,at:new Date(Date.now()+60000)});
      expect(id).toBeTruthy();
      expect(await queue.schedule(name,{tenant_id:seedTenant},{key})).toBeNull();
      await queue.cancel(name,id!);
      expect((await queue.boss.getJobById(name,id!))?.state).toBe('cancelled');
    } finally { await queue.stop(); }
  });
});
