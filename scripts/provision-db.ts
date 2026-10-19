import { Pool } from 'pg';
import PgBoss from 'pg-boss';
// Executado manualmente pelo operador com a credencial administrativa, nunca pela API.
if(!process.env.MIGRATION_DATABASE_URL)throw new Error('Defina MIGRATION_DATABASE_URL');
const pool=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const literal=(value:string)=>`'${value.replaceAll("'","''")}'`;
try {
  for(const [name,variable,role] of [['operaon_api','API_DB_PASSWORD','operaon_app'],['operaon_worker_login','WORKER_DB_PASSWORD','operaon_worker'],['operaon_broker','BROKER_DB_PASSWORD',null]] as const){
    const password=process.env[variable];if(!password||password.length<24)throw new Error(`Defina ${variable} com pelo menos 24 caracteres`);
    const exists=(await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rowCount;
    await pool.query(`${exists?'ALTER':'CREATE'} ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${literal(password)}`);
    if(role)await pool.query(`GRANT ${role} TO ${name}`);
  }
  await pool.query('CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION operaon_broker');
  await pool.query('GRANT USAGE,CREATE ON SCHEMA pgboss TO operaon_broker');
  // pg-boss emite CREATE SCHEMA IF NOT EXISTS no bootstrap, que exige CREATE no banco mesmo com schema existente.
  // Conceder apenas durante a instalação, criar objetos com o login do broker e revogar sempre ao terminar.
  const database=(await pool.query<{name:string}>('SELECT current_database() AS name')).rows[0]!.name;
  const identifier=`"${database.replaceAll('"','""')}"`;
  await pool.query(`GRANT CREATE ON DATABASE ${identifier} TO operaon_broker`);
  const brokerUrl=new URL(process.env.MIGRATION_DATABASE_URL);brokerUrl.username='operaon_broker';brokerUrl.password=process.env.BROKER_DB_PASSWORD!;
  const broker=new PgBoss(brokerUrl.toString());broker.on('error',()=>process.stderr.write('Falha no bootstrap do broker\n'));
  try{await broker.start();await broker.stop({graceful:true,timeout:5000});}
  finally{await pool.query(`REVOKE CREATE ON DATABASE ${identifier} FROM operaon_broker`);}
  // Nenhum login de aplicação pode criar objetos no schema de negócio.
  await pool.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
}finally{await pool.end();}
