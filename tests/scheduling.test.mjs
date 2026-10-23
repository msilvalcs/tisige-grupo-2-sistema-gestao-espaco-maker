import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

dotenv.config({ quiet: true });
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) throw new Error('Configure DATABASE_URL para executar testes com PostgreSQL real.');
const databaseName = 'siges_scheduling_' + randomUUID().replaceAll('-', '');
const admin = new pg.Client({ connectionString: originalUrl });
let server, pool, base, managerCookie, userCookie, project, equipment, material, lowStock;

async function call(path, { method = 'GET', body, session = managerCookie, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'X-SIGES-Request': '1',
      'Content-Type': 'application/json',
      ...(session ? { Cookie: session } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
    cookie: response.headers.get('set-cookie'),
  };
}

async function login(email) {
  const result = await call('/auth/login', {
    method: 'POST',
    session: null,
    body: { email, password: process.env.SEED_PASSWORD },
  });
  assert.equal(result.status, 200);
  return { user: result.data, cookie: result.cookie.split(';')[0] };
}

function future(minutes = 90) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
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
  await database.seed();
  const { app } = await import('../apps/api/src/app.mjs');
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = 'http://127.0.0.1:' + server.address().port + '/api';
  ({ cookie: managerCookie } = await login('gestor@siges.local'));
  ({ cookie: userCookie } = await login('ana@siges.local'));
  project = (await call('/projects', { session: userCookie })).data[0];
  const equipmentRows = await call('/equipment');
  equipment = equipmentRows.data.find((entry) => entry.code === 'FDM-01');
  const materialRows = await call('/materials');
  material = materialRows.data.find((entry) => entry.name === 'PLA Branco 1,75 mm');
  lowStock = materialRows.data.find((entry) => entry.name === 'PETG Preto 1,75 mm');
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  await admin.query('DROP DATABASE IF EXISTS "' + databaseName + '" WITH (FORCE)');
  await admin.end();
});

test('cria agendamento, reserva material e é idempotente', async () => {
  const before = (await call('/materials')).data.find((entry) => entry.id === material.id);
  const body = {
    equipment_id: equipment.id,
    material_id: material.id,
    project_id: project.id,
    started_at: future(120),
    duration_min: 45,
    material_grams: 50,
    notes: 'Peça de validação',
  };
  const first = await call('/bookings', {
    method: 'POST',
    body,
    session: userCookie,
    headers: { 'Idempotency-Key': 'booking-idempotency-1' },
  });
  assert.equal(first.status, 201);
  const replay = await call('/bookings', {
    method: 'POST',
    body,
    session: userCookie,
    headers: { 'Idempotency-Key': 'booking-idempotency-1' },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.id, first.data.id);
  const afterCreate = (await call('/materials')).data.find((entry) => entry.id === material.id);
  assert.equal(Number(afterCreate.reserved) - Number(before.reserved), 50);
});

test('rejeita conflito, passado, tecnologia incompatível e equipamento inativo', async () => {
  const conflict = await call('/bookings', {
    method: 'POST',
    session: userCookie,
    headers: { 'Idempotency-Key': 'booking-conflict-1' },
    body: {
      equipment_id: equipment.id,
      material_id: material.id,
      project_id: project.id,
      started_at: future(120),
      duration_min: 30,
      material_grams: 10,
    },
  });
  assert.equal(conflict.status, 409);
  const past = await call('/bookings', {
    method: 'POST',
    session: userCookie,
    body: {
      equipment_id: equipment.id,
      material_id: material.id,
      project_id: project.id,
      started_at: new Date(Date.now() - 60000).toISOString(),
      duration_min: 30,
      material_grams: 10,
    },
  });
  assert.equal(past.status, 400);
  const resin = (await call('/materials')).data.find((entry) => entry.technology === 'RESIN');
  const incompatible = await call('/bookings', {
    method: 'POST',
    session: userCookie,
    body: {
      equipment_id: equipment.id,
      material_id: resin.id,
      project_id: project.id,
      started_at: future(300),
      duration_min: 30,
      material_grams: 10,
    },
  });
  assert.equal(incompatible.status, 400);
  const inactive = await call('/equipment/' + equipment.id, {
    method: 'PUT',
    body: { code: equipment.code, model: equipment.model, technology: equipment.technology, location: equipment.location, active: false },
  });
  assert.equal(inactive.status, 200);
  const unavailable = await call('/bookings', {
    method: 'POST',
    session: userCookie,
    body: {
      equipment_id: equipment.id,
      material_id: material.id,
      project_id: project.id,
      started_at: future(400),
      duration_min: 30,
      material_grams: 10,
    },
  });
  assert.equal(unavailable.status, 400);
  await call('/equipment/' + equipment.id, {
    method: 'PUT',
    body: { code: equipment.code, model: equipment.model, technology: equipment.technology, location: equipment.location, active: true },
  });
});

test('concorrência pelo mesmo equipamento aceita apenas uma reserva', async () => {
  const body = {
    equipment_id: equipment.id,
    material_id: material.id,
    project_id: project.id,
    started_at: future(600),
    duration_min: 40,
    material_grams: 10,
  };
  const results = await Promise.all([
    call('/bookings', { method: 'POST', body, session: userCookie, headers: { 'Idempotency-Key': 'concurrent-user' } }),
    call('/bookings', { method: 'POST', body, session: managerCookie, headers: { 'Idempotency-Key': 'concurrent-manager' } }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
});

test('saldo insuficiente exige confirmação explícita e cancelamento devolve reserva', async () => {
  const body = {
    equipment_id: equipment.id,
    material_id: lowStock.id,
    project_id: project.id,
    started_at: future(800),
    duration_min: 20,
    material_grams: 20,
  };
  const warning = await call('/bookings', { method: 'POST', body, session: userCookie, headers: { 'Idempotency-Key': 'low-stock-1' } });
  assert.equal(warning.status, 200);
  assert.equal(warning.data.requires_confirmation, true);
  const created = await call('/bookings', {
    method: 'POST',
    body: { ...body, confirm_low_stock: true },
    session: userCookie,
    headers: { 'Idempotency-Key': 'low-stock-1' },
  });
  assert.equal(created.status, 201);
  const cancelled = await call('/bookings/' + created.data.id + '/cancel', {
    method: 'PATCH',
    session: userCookie,
    body: { reason: 'Projeto pausado para revisão' },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.status, 'cancelled');
});

test('ciclo de execução registra consumo real e impede cancelamento inválido', async () => {
  const created = await call('/bookings', {
    method: 'POST',
    session: userCookie,
    body: {
      equipment_id: equipment.id,
      material_id: material.id,
      project_id: project.id,
      started_at: future(1000),
      duration_min: 70,
      material_grams: 40,
    },
  });
  assert.equal(created.status, 201);
  assert.equal((await call('/bookings/' + created.data.id + '/status', { method: 'PATCH', session: userCookie, body: { status: 'confirmed' } })).status, 200);
  assert.equal((await call('/bookings/' + created.data.id + '/status', { method: 'PATCH', session: userCookie, body: { status: 'in_progress' } })).status, 200);
  const done = await call('/bookings/' + created.data.id + '/status', {
    method: 'PATCH',
    session: userCookie,
    body: { status: 'done', actual_material_grams: 30 },
  });
  assert.equal(done.status, 200);
  assert.equal(done.data.status, 'done');
  assert.equal((await call('/bookings/' + created.data.id + '/cancel', { method: 'PATCH', session: userCookie, body: { reason: 'Não deve funcionar' } })).status, 409);
});

test('manutenção, dashboard e métricas mantêm contratos e permissões', async () => {
  const denied = await call('/maintenance', {
    method: 'POST',
    session: userCookie,
    body: { equipment_id: equipment.id, performed_at: '2026-10-20', description: 'Limpeza preventiva', next_due: '2026-11-20' },
  });
  assert.equal(denied.status, 403);
  const invalid = await call('/maintenance', {
    method: 'POST',
    body: { equipment_id: equipment.id, performed_at: '2026-10-20', description: 'Curto', next_due: '2026-10-19' },
  });
  assert.equal(invalid.status, 400);
  const missing = await call('/maintenance', {
    method: 'POST',
    body: { equipment_id: randomUUID(), performed_at: '2026-10-20', description: 'Limpeza preventiva', next_due: '2026-11-20' },
  });
  assert.equal(missing.status, 404);
  const created = await call('/maintenance', {
    method: 'POST',
    body: { equipment_id: equipment.id, performed_at: '2025-10-20', description: 'Limpeza preventiva', next_due: '2025-11-20' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'overdue');
  const list = await call('/maintenance', { session: userCookie });
  assert.ok(list.data.some((entry) => entry.status === 'overdue'));
  const dashboard = await call('/dashboard', { session: userCookie });
  assert.ok(['Bom dia', 'Boa tarde', 'Boa noite'].includes(dashboard.data.saudacao));
  assert.ok(Array.isArray(dashboard.data.today_bookings));
  assert.ok(Array.isArray(dashboard.data.stock_alerts));
  assert.equal((await call('/metrics', { session: userCookie })).status, 403);
  const metrics = await call('/metrics');
  assert.equal(metrics.status, 200);
  assert.ok(Number(metrics.data.bookings_done) >= 1);
  assert.ok(Number(metrics.data.bookings_cancelled) >= 1);
  assert.ok(Number(metrics.data.maintenance_count) >= 1);
  assert.ok(metrics.data.maintenance_by_equipment.some((entry) => entry.equipment_code === equipment.code));
});
