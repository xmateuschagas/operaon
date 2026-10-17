import { Pool } from 'pg';
import { migrate } from './migrate.js';

// Credencial de migration é separada da credencial usada pelas requisições.
if (!process.env.MIGRATION_DATABASE_URL) throw new Error('Defina MIGRATION_DATABASE_URL em dev/staging');
const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
try { await migrate(pool, process.argv[2] === 'down' ? 'down' : 'up'); }
finally { await pool.end(); }
