import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const folder = fileURLToPath(new URL('../../migrations/', import.meta.url));

// Lock transacional serializa réplicas; checksum impede alterar migration aplicada.
export async function migrate(pool: Pool, direction: 'up' | 'down' = 'up') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(72410918)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
    const files = (await readdir(folder)).filter((file) => file.endsWith('.up.sql')).sort();
    const applied = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations ORDER BY name');
    if (direction === 'down') {
      const last = applied.rows.at(-1);
      if (last) {
        await client.query(await readFile(`${folder}/${last.name.replace('.up.sql', '.down.sql')}`, 'utf8'));
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [last.name]);
      }
    } else {
      for (const file of files) {
        const source = await readFile(`${folder}/${file}`, 'utf8');
        const checksum = createHash('sha256').update(source).digest('hex');
        const existing = applied.rows.find((row) => row.name === file);
        if (existing && existing.checksum !== checksum) throw new Error(`Migration alterada: ${file}`);
        if (!existing) {
          await client.query(source);
          await client.query('INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)', [file, checksum]);
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
