import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
dotenv.config({ quiet: true });
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl)
  throw new Error('Configure DATABASE_URL para executar testes com PostgreSQL real.');
const databaseName = 'siges_test_' + randomUUID().replaceAll('-', '');
const admin = new pg.Client({ connectionString: originalUrl });
let server, pool, base, cookie, userCookie, user, manager, material, project;
async function call(path, { method = 'GET', body, session = cookie, header = true } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(header ? { 'X-SIGES-Request': '1' } : {}),
      'Content-Type': 'application/json',
      ...(session ? { Cookie: session } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
    cookie: response.headers.get('set-cookie'),
  };
}
before(async () => {
  await admin.connect();
  await admin.query('CREATE DATABASE "' + databaseName + '"');
  const url = new URL(originalUrl);
  url.pathname = '/' + databaseName;
  process.env.DATABASE_URL = url.href;
  process.env.SEED_PASSWORD = 'SenhaDeTeste123!';
  const database = await import('../apps/api/src/database.mjs');
  pool = database.pool;
  await database.migrate();
  await database.migrate();
  await database.seed();
  await database.seed();
  const { app } = await import('../apps/api/src/app.mjs');
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  await admin.query('DROP DATABASE IF EXISTS "' + databaseName + '" WITH (FORCE)');
  await admin.end();
});
test('saúde e acesso anônimo', async () => {
  assert.equal((await call('/health', { session: null })).status, 200);
  assert.equal((await call('/projects', { session: null })).status, 401);
});
test('login válido, senha inválida, cookies protegidos e autoria de sessão', async () => {
  assert.equal(
    (
      await call('/auth/login', {
        method: 'POST',
        body: { email: 'gestor@siges.local', password: 'errada' },
      })
    ).status,
    401,
  );
  const result = await call('/auth/login', {
    method: 'POST',
    body: { email: 'gestor@siges.local', password: process.env.SEED_PASSWORD },
  });
  assert.equal(result.status, 200);
  assert.match(result.cookie, /HttpOnly/);
  assert.match(result.cookie, /SameSite=Strict/);
  cookie = result.cookie.split(';')[0];
  manager = result.data;
  assert.equal((await call('/auth/me')).data.id, manager.id);
  const ordinary = await call('/auth/login', {
    method: 'POST',
    session: null,
    body: { email: 'ana@siges.local', password: process.env.SEED_PASSWORD },
  });
  userCookie = ordinary.cookie.split(';')[0];
  user = ordinary.data;
});
test('seed repetível e validação do contrato', async () => {
  assert.equal((await call('/equipment')).data.length, 3);
  assert.equal((await call('/materials')).data.length, 4);
  assert.equal((await call('/equipment', { method: 'POST', body: { code: '' } })).status, 400);
  assert.equal((await call('/equipment', { method: 'POST', header: false, body: {} })).status, 403);
  assert.equal((await call('/missing')).status, 404);
});
test('usuário comum não consegue administrar equipamentos, pessoas ou estoque', async () => {
  for (const path of ['/equipment', '/materials', '/users'])
    assert.equal((await call(path, { method: 'POST', session: userCookie, body: {} })).status, 403);
  assert.equal((await call('/users', { session: userCookie })).data.length, 1);
});
test('projetos persistem, limitam autoria e preservam vínculos ao inativar', async () => {
  const result = await call('/projects', {
    method: 'POST',
    body: {
      name: 'Projeto de integração',
      description: 'Teste com banco real',
      owner_id: manager.id,
    },
  });
  assert.equal(result.status, 201);
  project = result.data;
  assert.ok((await call('/projects')).data.some((p) => p.id === project.id));
  assert.ok(
    !(await call('/projects', { session: userCookie })).data.some((p) => p.id === project.id),
  );
  assert.equal(
    (
      await call('/projects/' + project.id, {
        method: 'PUT',
        session: userCookie,
        body: { name: 'Tentativa inválida', owner_id: user.id },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call('/projects', {
        method: 'POST',
        session: userCookie,
        body: { name: 'Autoria forjada', owner_id: manager.id },
      })
    ).status,
    403,
  );
  const inactive = await call('/projects/' + project.id, {
    method: 'PUT',
    body: {
      name: project.name,
      description: project.description,
      owner_id: manager.id,
      active: false,
    },
  });
  assert.equal(inactive.data.active, false);
  assert.equal(inactive.data.owner_id, manager.id);
});
test('equipamentos validam duplicidade e inativação', async () => {
  const body = {
    code: 'TEST-01',
    model: 'Modelo teste',
    technology: 'FDM',
    location: 'Laboratório',
  };
  const created = await call('/equipment', { method: 'POST', body });
  assert.equal(created.status, 201);
  assert.equal((await call('/equipment', { method: 'POST', body })).status, 409);
  assert.equal(
    (
      await call('/equipment/' + created.data.id, {
        method: 'PUT',
        body: { ...body, active: false },
      })
    ).data.active,
    false,
  );
});
test('estoque, unidade coerente, precisão e histórico com autoria', async () => {
  const created = await call('/materials', {
    method: 'POST',
    body: { name: 'Resina teste', technology: 'RESIN', minimum: 5 },
  });
  assert.equal(created.status, 201);
  material = created.data;
  assert.equal(material.unit, 'ml');
  assert.equal(
    (
      await call('/materials/' + material.id + '/movements', {
        method: 'POST',
        session: userCookie,
        body: { quantity: 1, reason: 'Tentativa de acesso' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call('/materials/' + material.id + '/movements', {
        method: 'POST',
        body: { quantity: 1.2345, reason: 'Precisão inválida' },
      })
    ).status,
    400,
  );
  const move = await call('/materials/' + material.id + '/movements', {
    method: 'POST',
    body: { quantity: 10.125, reason: 'Entrada para teste', author_id: user.id },
  });
  assert.equal(move.status, 201);
  assert.equal(move.data.author_id, manager.id);
  assert.equal(
    (
      await call('/materials/' + material.id, {
        method: 'PUT',
        body: { name: material.name, technology: 'FDM', minimum: 5 },
      })
    ).status,
    409,
  );
  const history = await call('/materials/' + material.id + '/movements');
  assert.equal(history.data.length, 1);
  assert.equal(Number(history.data[0].resulting_balance), 10.125);
});
test('concorrência pelo último saldo permite apenas uma saída e não perde histórico', async () => {
  const results = await Promise.all(
    [1, 2].map(() =>
      call('/materials/' + material.id + '/movements', {
        method: 'POST',
        body: { quantity: -10, reason: 'Saída concorrente' },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const current = (await call('/materials')).data.find((m) => m.id === material.id);
  assert.equal(Number(current.physical), 0.125);
  assert.equal(Number(current.available), 0.125);
  assert.equal((await call('/materials/' + material.id + '/movements')).data.length, 2);
  assert.equal(
    (
      await call('/materials/' + material.id + '/movements', {
        method: 'POST',
        body: { quantity: -1, reason: 'Saldo insuficiente' },
      })
    ).status,
    409,
  );
});
test('logout invalida sessão no servidor', async () => {
  assert.equal((await call('/auth/logout', { method: 'POST' })).status, 204);
  assert.equal((await call('/auth/me')).status, 401);
});
