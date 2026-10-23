import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../.local/postgres', import.meta.url));
const database = new EmbeddedPostgres({
  databaseDir: directory,
  user: 'siges',
  password: 'siges_local',
  port: 5433,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: console.log,
  onError: console.error,
});
if (!existsSync(directory + '/PG_VERSION')) await database.initialise();
await database.start();
const client = database.getPgClient('postgres', '127.0.0.1');
await client.connect();
try {
  if (!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1', ['siges'])).rowCount)
    await client.query('CREATE DATABASE siges');
} finally {
  await client.end();
}
console.log('PostgreSQL local em 127.0.0.1:5433. Ctrl+C para parar; os dados serão preservados.');
async function stop() {
  await database.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 60000);
