import { execFileSync,spawn } from 'node:child_process';
import { mkdir,writeFile,rm } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { Pool } from 'pg';

// Harness exclusivamente local/CI; recebe somente a URL explicitamente marcada como banco de teste.
const url=new URL(process.env.TEST_DATABASE_URL??'');
const database=url.pathname.slice(1);const user=decodeURIComponent(url.username);const password=decodeURIComponent(url.password);
if(!/^[\w]+$/.test(database)||!database.includes('test')||!/^\w+$/.test(user)||/[\r\n]/.test(password))throw new Error('Configure uma URL de teste válida');
const upstream=process.env.POOL_UPSTREAM_HOST??'host.docker.internal';const upstreamPort=process.env.POOL_UPSTREAM_PORT??(url.port||'5432');
if(!/^[\w.-]+$/.test(upstream)||!/^\d+$/.test(upstreamPort))throw new Error('Upstream inválido');
const directory=resolve('.local',`pool-${crypto.randomUUID()}`);await mkdir(directory,{recursive:true});
const name=`operaon-pool-test-${crypto.randomUUID().slice(0,8)}`;const port=Number(process.env.POOL_TEST_PORT??56432);
const docker=(args:string[])=>execFileSync('docker',args,{stdio:['ignore','pipe','pipe']}).toString().trim();
const escaped=password.replaceAll('\\','\\\\').replaceAll('"','\\"');
// Credencial descartável de teste, legível pelo UID sem root do container; diretório é removido ao concluir.
await writeFile(resolve(directory,'users.txt'),`"${user}" "${escaped}"\n`,{mode:0o444});
await writeFile(resolve(directory,'pgbouncer.ini'),`[databases]\n${database} = host=${upstream} port=${upstreamPort} dbname=${database}\n[pgbouncer]\nlisten_addr=0.0.0.0\nlisten_port=6432\nunix_socket_dir=/tmp\nauth_type=scram-sha-256\nauth_file=/run/secrets/test_users\npool_mode=transaction\ndefault_pool_size=1\nmax_client_conn=40\nmax_prepared_statements=0\nserver_reset_query=DISCARD ALL\nserver_reset_query_always=1\nlog_connections=0\nlog_disconnections=0\n`);
try {
  docker(['run','-d','--name',name,'--network',process.env.POOL_DOCKER_NETWORK??'bridge','--add-host','host.docker.internal:host-gateway','-p',`127.0.0.1:${port}:6432`,'-v',`${resolve(directory,'users.txt')}:/run/secrets/test_users:ro`,'-v',`${resolve(directory,'pgbouncer.ini')}:/etc/pgbouncer/pgbouncer.ini:ro`,'operaon-pgbouncer:test']);
  url.hostname='127.0.0.1';url.port=String(port);const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:1500});let ready=false;
  try{for(let attempt=0;attempt<10;attempt++){try{await pool.query('SELECT 1');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}}}finally{await pool.end();}
  if(!ready)throw new Error('PgBouncer de teste não ficou pronto');
  if(!process.env.npm_execpath)throw new Error('Execute usando pnpm test:pool');
  const child=spawn(process.execPath,[process.env.npm_execpath,'exec','vitest','run','tests/pooling.test.ts'],{stdio:'inherit',env:{...process.env,POOLED_TEST_DATABASE_URL:url.toString()}});
  const code=await new Promise<number|null>(resolve=>child.once('exit',resolve));if(code!==0)throw new Error('Validação de pooling falhou');
}finally{
  try{docker(['rm','-f',name]);}catch{/* Remover somente o container criado por esta execução. */}
  // Caminho absoluto foi criado acima dentro de .local; nunca remover arquivos do usuário.
  if(directory.startsWith(resolve('.local')+sep)&&directory.split(sep).at(-1)?.startsWith('pool-'))await rm(directory,{recursive:true,force:true});
  else process.stderr.write('Recusado remover caminho fora do harness\n');
}
