import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';

// Dados inteiramente fictícios e IDs estáveis tornam o seed repetível em dev.
export const seedTenant = '10000000-0000-4000-8000-000000000001';
export const seedUser = '20000000-0000-4000-8000-000000000001';
export async function seed(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO tenants(id,nome,status) VALUES ($1,'Workspace demonstração','ACTIVE') ON CONFLICT DO NOTHING", [seedTenant]);
    await client.query("INSERT INTO users(id,nome,email) VALUES ($1,'Pessoa fictícia','demo@example.invalid') ON CONFLICT DO NOTHING", [seedUser]);
    await client.query("INSERT INTO tenant_members(tenant_id,user_id,role,status) VALUES ($1,$2,'OWNER','ACTIVE') ON CONFLICT DO NOTHING", [seedTenant, seedUser]);
    await client.query('UPDATE tenants SET default_owner_user_id=$2 WHERE id=$1', [seedTenant, seedUser]);
    for (const name of ['EasyBread','PeguePagON','GEP','Site']) {
      await client.query('INSERT INTO products(tenant_id,nome) SELECT $1::uuid,$2::varchar(120) WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id=$1::uuid AND nome=$2::varchar(120))', [seedTenant, name]);
    }
    for (let n = 0; n < 10; n++) {
      const stage = ['NOVO','CONTATO_INICIADO','QUALIFICADO','PROPOSTA_ENVIADA','NEGOCIACAO','GANHO'][n % 6];
      await client.query("INSERT INTO leads(tenant_id,user_id,nome,telefone_e164,origem,necessidade_resumo,etapa,data_proximo_passo,descricao_proximo_passo,created_at) VALUES ($1,$2,$3,$4,'Seed','Demonstração',$5,NOW(),'Primeiro contato',NOW() - INTERVAL '8 days') ON CONFLICT DO NOTHING", [seedTenant,seedUser,`Lead fictício ${n+1}`,`55219900000${String(n).padStart(2,'0')}`,stage]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Importar em testes não executa seed automaticamente.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error('Defina MIGRATION_DATABASE_URL');
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try { await seed(pool); } finally { await pool.end(); }
}
