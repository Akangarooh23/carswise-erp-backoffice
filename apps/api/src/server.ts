import 'dotenv/config';
import { config } from './config.js';
import { ensureSchema } from './db/schema.js';
import { createApp } from './app.js';

async function start() {
  await ensureSchema();
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`[server] carswise-erp-api on http://localhost:${config.PORT}  env=${config.NODE_ENV}`);
  });
}

start().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
