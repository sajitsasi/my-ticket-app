import { createApp } from './app.js';
import { env } from './env.js';
import { pool } from './db.js';

const app = createApp();

const server = app.listen(env.apiPort, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${env.apiPort}`);
});

function shutdown(signal: NodeJS.Signals) {
  // eslint-disable-next-line no-console
  console.log(`[api] received ${signal}, shutting down`);
  server.close(() => {
    pool.end().finally(() => {
      process.exit(0);
    });
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
