import { readFile } from 'node:fs/promises';
// Somente variáveis conhecidas podem ser carregadas de Docker secrets; nunca registrar seus valores.
const names=['DATABASE_URL','WORKER_DATABASE_URL','QUEUE_DATABASE_URL','MIGRATION_DATABASE_URL','SESSION_SECRET','TOKEN_ENC_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','WHATSAPP_API_TOKEN','ADMIN_WHATSAPP','ADMIN_EMAIL','NOTIFICATION_RECIPIENTS_JSON','API_DB_PASSWORD','WORKER_DB_PASSWORD','BROKER_DB_PASSWORD'] as const;
export async function loadSecrets(environment:NodeJS.ProcessEnv=process.env) {
  for(const name of names){const file=environment[`${name}_FILE`];if(file)environment[name]=(await readFile(file,'utf8')).trim();}
}
