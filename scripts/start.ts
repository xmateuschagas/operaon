import { loadSecrets } from '../packages/shared/src/secrets.js';
// Import dinâmico garante que a configuração da aplicação só seja avaliada depois dos secrets.
await loadSecrets();
const service=process.argv[2];
if(service==='api')await import('../apps/api/src/main.js');
else if(service==='worker')await import('../apps/worker/src/main.js');
else if(service==='migrate')await import('../packages/shared/src/db/cli.js');
else if(service==='provision')await import('./provision-db.js');
else throw new Error('Serviço inválido');
