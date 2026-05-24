import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '..', '..', '..', '.env') });

export const env = {
  apiPort: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:4001',
  databaseUrl: process.env.DATABASE_URL,
  pgUser: process.env.PGUSER,
  pgPassword: process.env.PGPASSWORD,
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
