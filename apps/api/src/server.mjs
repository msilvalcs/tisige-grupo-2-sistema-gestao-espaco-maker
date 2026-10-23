import { app } from './app.mjs';
import { pool } from './database.mjs';
import { config } from './config.mjs';
await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
const server = app.listen(config.port, '127.0.0.1', () =>
  console.log('SIGES API: http://127.0.0.1:' + config.port),
);
async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
