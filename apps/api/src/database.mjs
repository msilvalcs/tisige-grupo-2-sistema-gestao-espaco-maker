import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from './config.mjs';
import { hashPassword } from './security.mjs';
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (error) => console.error('Falha na conexão com PostgreSQL:', error.message));
export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function migrate() {
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(817244)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = new URL('../migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount)
        continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
    }
  });
}
export async function seed() {
  if (config.production) throw new Error('Seed de demonstração desabilitado em produção.');
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('SEED_PASSWORD deve ter pelo menos 12 caracteres.');
  const hash = await hashPassword(password);
  await transaction(async (client) => {
    for (const [name, email, role] of [
      ['Gestor Maker', 'gestor@siges.local', 'manager'],
      ['Ana Mendes', 'ana@siges.local', 'user'],
    ]) {
      await client.query(
        'INSERT INTO users(name,email,password_hash,role) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING',
        [name, email, hash, role],
      );
    }
    const {
      rows: [owner],
    } = await client.query("SELECT id FROM users WHERE email='ana@siges.local'");
    if (!(await client.query('SELECT 1 FROM projects LIMIT 1')).rowCount) {
      await client.query('INSERT INTO projects(name,description,owner_id) VALUES ($1,$2,$3)', [
        'Prótese de mão',
        'Protótipo acadêmico para estudo de acessibilidade.',
        owner.id,
      ]);
    }
    for (const [code, model, technology] of [
      ['FDM-01', 'Creality Ender 3', 'FDM'],
      ['FDM-02', 'Prusa MK4', 'FDM'],
      ['RES-01', 'Elegoo Mars', 'RESIN'],
    ]) {
      await client.query(
        'INSERT INTO equipment(code,model,technology,location) VALUES ($1,$2,$3,$4) ON CONFLICT(code) DO NOTHING',
        [code, model, technology, 'Coração Eucarístico'],
      );
    }
    for (const [name, technology, unit, minimum, physical] of [
      ['PLA Branco 1,75 mm', 'FDM', 'g', 200, 1240],
      ['PLA Azul 1,75 mm', 'FDM', 'g', 200, 140],
      ['Resina Standard Grey', 'RESIN', 'ml', 200, 180],
      ['PETG Preto 1,75 mm', 'FDM', 'g', 100, 0],
    ]) {
      const result = await client.query(
        'INSERT INTO materials(name,technology,unit,minimum,physical) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(name) DO NOTHING RETURNING id',
        [name, technology, unit, minimum, physical],
      );
      if (result.rowCount && physical)
        await client.query(
          "INSERT INTO stock_movements(material_id,author_id,quantity,resulting_balance,reason,created_at) SELECT $1,id,$2,$2,'Saldo inicial da demonstração','2026-10-22T12:00:00-03:00' FROM users WHERE email='gestor@siges.local'",
          [result.rows[0].id, physical],
        );
    }
    const {
      rows: [seedEquipment],
    } = await client.query("SELECT id FROM equipment WHERE code='FDM-01'");
    if (
      seedEquipment &&
      !(await client.query('SELECT 1 FROM maintenance_logs WHERE equipment_id=$1 LIMIT 1', [seedEquipment.id])).rowCount
    )
      await client.query(
        `INSERT INTO maintenance_logs(equipment_id,performed_at,description,next_due,created_by)
         SELECT $1,'2026-10-20','Calibração preventiva e limpeza do bico','2026-11-20',id
         FROM users WHERE email='gestor@siges.local'`,
        [seedEquipment.id],
      );
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'migrate') await migrate();
    else if (process.argv[2] === 'seed') await seed();
    else throw new Error('Use migrate ou seed.');
    console.log('Banco atualizado com sucesso.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
