import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '..', '..', '..', '.env') });
const migrationsDir = join(here, '..', 'migrations');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migration files found in ${migrationsDir}`);
  }

  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    process.stdout.write(`[migrate] applying ${file}\n`);
    await pool.query(sql);
  }

  process.stdout.write('[migrate] done\n');
}

main()
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
