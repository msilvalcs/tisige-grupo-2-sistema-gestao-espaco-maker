import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool, transaction } from './database.mjs';
import { config } from './config.mjs';
import { newToken, tokenHash, verifyPassword, hashPassword } from './security.mjs';
import { fileURLToPath } from 'node:url';

const text = z.string().trim().min(2, 'Informe pelo menos 2 caracteres.').max(100);
const identifier = z.string().uuid();
const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});
const projectSchema = z.object({
  name: text,
  description: z.string().trim().max(1000).default(''),
  owner_id: identifier,
  active: z.boolean().default(true),
});
const equipmentSchema = z.object({
  code: text.max(30),
  model: text,
  technology: z.enum(['FDM', 'RESIN']),
  location: text,
  active: z.boolean().default(true),
});
const materialSchema = z.object({
  name: text,
  technology: z.enum(['FDM', 'RESIN']),
  minimum: z.number().finite().min(0).max(999999999).multipleOf(0.001),
  active: z.boolean().default(true),
});
const movementSchema = z.object({
  quantity: z
    .number()
    .finite()
    .min(-999999999)
    .max(999999999)
    .multipleOf(0.001)
    .refine((n) => n !== 0, 'Quantidade deve ser diferente de zero.'),
  reason: z.string().trim().min(5).max(500),
});
const bookingSchema = z.object({
  equipment_id: identifier,
  material_id: identifier,
  project_id: identifier,
  started_at: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), 'Informe uma data válida.'),
  duration_min: z.number().int().min(1).max(1440),
  material_grams: z.number().finite().min(1).max(99999).multipleOf(0.001),
  notes: z.string().trim().max(2000).default(''),
  confirm_low_stock: z.boolean().default(false),
});
const cancelBookingSchema = z.object({ reason: z.string().trim().min(5).max(255) });
const rescheduleBookingSchema = z.object({
  started_at: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), 'Informe uma data válida.'),
  duration_min: z.number().int().min(1).max(1440),
});
const transitionBookingSchema = z.object({
  status: z.enum(['confirmed', 'in_progress', 'done', 'interrupted']),
  actual_material_grams: z.number().finite().min(0).max(99999).multipleOf(0.001).optional(),
  reason: z.string().trim().min(5).max(255).optional(),
});
const maintenanceSchema = z
  .object({
    equipment_id: identifier,
    performed_at: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida.'),
    description: z.string().trim().min(5).max(1000),
    next_due: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida.'),
  })
  .refine((input) => input.next_due > input.performed_at, {
    path: ['next_due'],
    message: 'A próxima manutenção deve ser posterior à realização.',
  });
export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.use(
  '/api',
  rateLimit({ windowMs: 60000, limit: 500, standardHeaders: 'draft-8', legacyHeaders: false }),
);
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-SIGES-Request') !== '1')
    return res.status(403).json({ message: 'Origem da solicitação inválida.' });
  res.set('Cache-Control', 'no-store');
  next();
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
});
const sessionOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: config.production,
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
};
const sessionToken = (req) => {
  const value = (req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('siges_session='));
  return value?.slice('siges_session='.length);
};
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});
app.post(
  '/api/auth/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.' },
  }),
  async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const {
      rows: [user],
    } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    // Run the same expensive derivation for unknown accounts to avoid a fast identity oracle.
    const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
    const valid = await verifyPassword(password, user?.password_hash || fallback);
    if (!user?.active || !valid) throw fail(401, 'E-mail ou senha inválidos.');
    const token = newToken();
    await transaction(async (client) => {
      await client.query('DELETE FROM sessions WHERE expires_at<=now()');
      const oldToken = sessionToken(req);
      if (oldToken)
        await client.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(oldToken)]);
      await client.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '8 hours')",
        [tokenHash(token), user.id],
      );
    });
    res.cookie('siges_session', token, sessionOptions).json(publicUser(user));
  },
);
app.use('/api', async (req, res, next) => {
  const token = sessionToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    return res.status(401).json({ message: 'Entre na sua conta para continuar.' });
  const {
    rows: [user],
  } = await pool.query(
    'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active',
    [tokenHash(token)],
  );
  if (!user) return res.status(401).json({ message: 'Sua sessão expirou. Entre novamente.' });
  req.user = publicUser(user);
  next();
});
const manager = (req, _res, next) => {
  if (req.user.role !== 'manager') throw fail(403, 'Esta ação é permitida apenas para gestores.');
  next();
};
app.get('/api/auth/me', (req, res) => res.json(req.user));
app.post('/api/auth/logout', async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(sessionToken(req))]);
  res
    .clearCookie('siges_session', { ...sessionOptions, maxAge: undefined })
    .status(204)
    .end();
});
app.get('/api/users', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id,name,email,role,active FROM users WHERE active=true AND ($1::boolean OR id=$2) ORDER BY name',
    [req.user.role === 'manager', req.user.id],
  );
  res.json(rows);
});
app.post('/api/users', manager, async (req, res) => {
  const input = z
    .object({
      name: text,
      email: z.email().trim().toLowerCase().max(254),
      password: z.string().min(12).max(128),
      role: z.enum(['user', 'manager']),
    })
    .parse(req.body);
  const {
    rows: [user],
  } = await pool.query(
    'INSERT INTO users(name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,active',
    [input.name, input.email, await hashPassword(input.password), input.role],
  );
  res.status(201).json(user);
});
app.get('/api/projects', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT p.*,u.name AS owner_name FROM projects p JOIN users u ON u.id=p.owner_id WHERE ($1::boolean OR p.owner_id=$2) ORDER BY p.created_at DESC,p.id',
    [req.user.role === 'manager', req.user.id],
  );
  res.json(rows);
});
async function saveProject(req, res) {
  const input = projectSchema.parse(req.body);
  if (req.user.role !== 'manager' && input.owner_id !== req.user.id)
    throw fail(403, 'Selecione sua própria conta como responsável.');
  const result = await transaction(async (client) => {
    if (req.params.id) {
      identifier.parse(req.params.id);
      const {
        rows: [existing],
      } = await client.query('SELECT * FROM projects WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!existing) throw fail(404, 'Projeto não encontrado.');
      if (req.user.role !== 'manager' && existing.owner_id !== req.user.id)
        throw fail(403, 'Você não pode editar projetos de outras pessoas.');
    }
    if (
      !(await client.query('SELECT 1 FROM users WHERE id=$1 AND active', [input.owner_id])).rowCount
    )
      throw fail(400, 'Responsável inválido.');
    if (req.params.id)
      return (
        await client.query(
          'UPDATE projects SET name=$1,description=$2,owner_id=$3,active=$4 WHERE id=$5 RETURNING *',
          [input.name, input.description, input.owner_id, input.active, req.params.id],
        )
      ).rows[0];
    return (
      await client.query(
        'INSERT INTO projects(name,description,owner_id,active) VALUES ($1,$2,$3,$4) RETURNING *',
        [input.name, input.description, input.owner_id, input.active],
      )
    ).rows[0];
  });
  res.status(req.params.id ? 200 : 201).json(result);
}
app.post('/api/projects', saveProject);
app.put('/api/projects/:id', saveProject);
app.get('/api/equipment', async (_req, res) =>
  res.json((await pool.query('SELECT * FROM equipment ORDER BY code')).rows),
);
async function saveEquipment(req, res) {
  const input = equipmentSchema.parse(req.body);
  const values = [input.code, input.model, input.technology, input.location, input.active];
  let result;
  if (req.params.id) {
    identifier.parse(req.params.id);
    result = await pool.query(
      'UPDATE equipment SET code=$1,model=$2,technology=$3,location=$4,active=$5 WHERE id=$6 RETURNING *',
      [...values, req.params.id],
    );
  } else
    result = await pool.query(
      'INSERT INTO equipment(code,model,technology,location,active) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      values,
    );
  if (!result.rowCount) throw fail(404, 'Equipamento não encontrado.');
  res.status(req.params.id ? 200 : 201).json(result.rows[0]);
}
app.post('/api/equipment', manager, saveEquipment);
app.put('/api/equipment/:id', manager, saveEquipment);
app.get('/api/materials', async (_req, res) =>
  res.json(
    (await pool.query('SELECT *,physical-reserved AS available FROM materials ORDER BY name')).rows,
  ),
);
async function saveMaterial(req, res) {
  const input = materialSchema.parse(req.body);
  const unit = input.technology === 'FDM' ? 'g' : 'ml';
  const result = await transaction(async (client) => {
    if (req.params.id) {
      identifier.parse(req.params.id);
      const {
        rows: [existing],
      } = await client.query('SELECT * FROM materials WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!existing) throw fail(404, 'Insumo não encontrado.');
      if (
        existing.technology !== input.technology &&
        (
          await client.query('SELECT 1 FROM stock_movements WHERE material_id=$1 LIMIT 1', [
            req.params.id,
          ])
        ).rowCount
      )
        throw fail(
          409,
          'Tecnologia e unidade não podem mudar após movimentações. Cadastre outro insumo.',
        );
      return (
        await client.query(
          'UPDATE materials SET name=$1,technology=$2,unit=$3,minimum=$4,active=$5 WHERE id=$6 RETURNING *',
          [input.name, input.technology, unit, input.minimum, input.active, req.params.id],
        )
      ).rows[0];
    }
    return (
      await client.query(
        'INSERT INTO materials(name,technology,unit,minimum,active) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [input.name, input.technology, unit, input.minimum, input.active],
      )
    ).rows[0];
  });
  res.status(req.params.id ? 200 : 201).json(result);
}
app.post('/api/materials', manager, saveMaterial);
app.put('/api/materials/:id', manager, saveMaterial);
app.get('/api/materials/:id/movements', async (req, res) => {
  identifier.parse(req.params.id);
  res.json(
    (
      await pool.query(
        'SELECT m.*,u.name AS author_name FROM stock_movements m JOIN users u ON u.id=m.author_id WHERE material_id=$1 ORDER BY created_at DESC,m.id DESC',
        [req.params.id],
      )
    ).rows,
  );
});
app.post('/api/materials/:id/movements', manager, async (req, res) => {
  identifier.parse(req.params.id);
  const input = movementSchema.parse(req.body);
  const movement = await transaction(async (client) => {
    const {
      rows: [material],
    } = await client.query('SELECT * FROM materials WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!material) throw fail(404, 'Insumo não encontrado.');
    if (!material.active) throw fail(409, 'Insumo inativo. Reative antes de movimentar.');
    const {
      rows: [updated],
    } = await client.query(
      'UPDATE materials SET physical=physical+$1 WHERE id=$2 AND physical+$1>=reserved RETURNING physical',
      [input.quantity, material.id],
    );
    if (!updated) throw fail(409, 'Saldo disponível insuficiente para esta movimentação.');
    return (
      await client.query(
        'INSERT INTO stock_movements(material_id,author_id,quantity,resulting_balance,reason) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [material.id, req.user.id, input.quantity, updated.physical, input.reason],
      )
    ).rows[0];
  });
  res.status(201).json(movement);
});
app.get('/api/maintenance', async (_req, res) => {
  res.json(
    (
      await pool.query(
        `SELECT ml.*,e.code AS equipment_code,e.model AS equipment_model,
                u.name AS created_by_name,
                CASE WHEN ml.next_due < CURRENT_DATE THEN 'overdue' ELSE 'ok' END AS status
         FROM maintenance_logs ml
         JOIN equipment e ON e.id=ml.equipment_id
         JOIN users u ON u.id=ml.created_by
         ORDER BY ml.performed_at DESC,ml.id DESC`,
      )
    ).rows,
  );
});
app.post('/api/maintenance', manager, async (req, res) => {
  const input = maintenanceSchema.parse(req.body);
  if (input.performed_at > new Date().toISOString().slice(0, 10))
    throw fail(400, 'A data de realização não pode estar no futuro.');
  const {
    rows: [maintenance],
  } = await transaction(async (client) => {
    const {
      rows: [equipment],
    } = await client.query('SELECT id FROM equipment WHERE id=$1', [input.equipment_id]);
    if (!equipment) throw fail(404, 'Equipamento não encontrado.');
    return client.query(
      `INSERT INTO maintenance_logs(equipment_id,performed_at,description,next_due,created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id,equipment_id,performed_at,description,next_due,created_by,created_at`,
      [
        input.equipment_id,
        input.performed_at,
        input.description,
        input.next_due,
        req.user.id,
      ],
    );
  });
  res.status(201).json({ ...maintenance, status: input.next_due < new Date().toISOString().slice(0, 10) ? 'overdue' : 'ok' });
});
const bookingSelect = `
  SELECT b.*, u.name AS user_name, e.code AS equipment_code, e.model AS equipment_model,
         e.technology AS equipment_technology, m.name AS material_name, m.unit AS material_unit,
         p.name AS project_name
  FROM bookings b
  JOIN users u ON u.id=b.user_id
  JOIN equipment e ON e.id=b.equipment_id
  JOIN materials m ON m.id=b.material_id
  JOIN projects p ON p.id=b.project_id
`;
app.get('/api/dashboard', async (req, res) => {
  const managerView = req.user.role === 'manager';
  const [summary, todayBookings, stockAlerts] = await Promise.all([
    pool.query(
      `SELECT
         CASE
           WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') BETWEEN 5 AND 11 THEN 'Bom dia'
           WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') BETWEEN 12 AND 17 THEN 'Boa tarde'
           ELSE 'Boa noite'
         END AS saudacao,
         (SELECT count(*) FROM bookings WHERE started_at::date=CURRENT_DATE) AS bookings_today,
         (SELECT count(*) FROM materials WHERE active AND physical-reserved <= minimum) AS materials_alert,
         (SELECT count(*) FROM equipment WHERE active) AS active_equipment,
         (SELECT count(*) FROM projects WHERE active AND ($1::boolean OR owner_id=$2)) AS active_projects`,
      [managerView, req.user.id],
    ),
    pool.query(
      `${bookingSelect} WHERE b.started_at::date=CURRENT_DATE ORDER BY b.started_at, b.id`,
    ),
    pool.query(
      `SELECT id,name,physical-reserved AS available,unit,minimum
       FROM materials
       WHERE active AND physical-reserved <= minimum
       ORDER BY available ASC,name ASC LIMIT 5`,
    ),
  ]);
  const data = summary.rows[0];
  const kpis = {
    bookings_today: Number(data.bookings_today),
    materials_alert: Number(data.materials_alert),
    active_equipment: Number(data.active_equipment),
    active_projects: Number(data.active_projects),
  };
  res.json({
    saudacao: data.saudacao,
    nome_usuario: req.user.name,
    ...kpis,
    kpis,
    today_bookings: todayBookings.rows,
    stock_alerts: stockAlerts.rows,
  });
});
app.get('/api/metrics', manager, async (_req, res) => {
  const [summary, materialByBooking, cancelledBookings, maintenanceByEquipment] = await Promise.all([
    pool.query(
      `SELECT
         ROUND(COALESCE(SUM(CASE WHEN b.status='done' AND m.technology='FDM' THEN b.material_grams ELSE 0 END),0) / 1000, 1) AS material_used_kg,
         count(*) FILTER (WHERE b.status='done') AS bookings_done,
         count(*) FILTER (WHERE b.status='cancelled') AS bookings_cancelled,
         (SELECT count(*) FROM maintenance_logs) AS maintenance_count
       FROM bookings b JOIN materials m ON m.id=b.material_id`,
    ),
    pool.query(
      `SELECT b.id,p.name AS project_name,m.name AS material_name,b.material_grams
       FROM bookings b JOIN projects p ON p.id=b.project_id JOIN materials m ON m.id=b.material_id
       WHERE b.status='done' AND m.technology='FDM'
       ORDER BY b.completed_at DESC NULLS LAST,b.started_at DESC`,
    ),
    pool.query(
      `SELECT b.id,p.name AS project_name,b.cancel_reason,b.cancelled_at
       FROM bookings b JOIN projects p ON p.id=b.project_id
       WHERE b.status='cancelled'
       ORDER BY b.cancelled_at DESC NULLS LAST,b.started_at DESC`,
    ),
    pool.query(
      `SELECT e.id,e.code AS equipment_code,e.model AS equipment_model,
              latest.performed_at,latest.next_due,
              trunc(COALESCE(SUM(b.duration_min),0)::numeric / 60)::integer AS hours,
              CASE WHEN latest.next_due < CURRENT_DATE THEN 'overdue' ELSE 'ok' END AS status
       FROM equipment e
       LEFT JOIN LATERAL (
         SELECT performed_at,next_due FROM maintenance_logs
         WHERE equipment_id=e.id ORDER BY performed_at DESC,id DESC LIMIT 1
       ) latest ON true
       LEFT JOIN bookings b ON b.equipment_id=e.id AND b.status='done'
       GROUP BY e.id,e.code,e.model,latest.performed_at,latest.next_due
       ORDER BY e.code`,
    ),
  ]);
  const data = summary.rows[0];
  res.json({
    material_used_kg: Number(data.material_used_kg),
    bookings_done: Number(data.bookings_done),
    bookings_cancelled: Number(data.bookings_cancelled),
    maintenance_count: Number(data.maintenance_count),
    material_by_booking: materialByBooking.rows,
    cancelled_bookings: cancelledBookings.rows,
    maintenance_by_equipment: maintenanceByEquipment.rows,
  });
});
function bookingId(req) {
  return identifier.parse(req.params.id);
}
function bookingEnd(startedAt, durationMin) {
  return new Date(new Date(startedAt).getTime() + durationMin * 60 * 1000);
}
async function bookingDetails(id) {
  const {
    rows: [booking],
  } = await pool.query(`${bookingSelect} WHERE b.id=$1`, [id]);
  return booking;
}
app.get('/api/bookings/mine', async (req, res) => {
  res.json(
    (
      await pool.query(
        `${bookingSelect} WHERE b.user_id=$1 ORDER BY b.started_at DESC, b.id DESC`,
        [req.user.id],
      )
    ).rows,
  );
});
app.get('/api/bookings/today', async (_req, res) => {
  res.json(
    (
      await pool.query(
        `${bookingSelect} WHERE b.started_at::date=CURRENT_DATE ORDER BY b.started_at, b.id`,
      )
    ).rows,
  );
});
app.post('/api/bookings', async (req, res) => {
  const input = bookingSchema.parse(req.body);
  const startedAt = new Date(input.started_at);
  if (startedAt <= new Date()) throw fail(400, 'O início do agendamento deve estar no futuro.');
  const idempotencyKey = req.get('Idempotency-Key')?.trim() || null;
  if (idempotencyKey && idempotencyKey.length > 200)
    throw fail(400, 'A chave de idempotência é muito longa.');
  const result = await transaction(async (client) => {
    if (idempotencyKey) {
      const {
        rows: [existing],
      } = await client.query('SELECT id FROM bookings WHERE user_id=$1 AND idempotency_key=$2', [
        req.user.id,
        idempotencyKey,
      ]);
      if (existing) return { id: existing.id, replayed: true };
    }
    const {
      rows: [equipment],
    } = await client.query('SELECT * FROM equipment WHERE id=$1 FOR UPDATE', [input.equipment_id]);
    if (!equipment) throw fail(400, 'Equipamento não encontrado.');
    if (!equipment.active) throw fail(400, 'Equipamento inativo e indisponível para reservas.');
    const {
      rows: [material],
    } = await client.query('SELECT * FROM materials WHERE id=$1 FOR UPDATE', [input.material_id]);
    if (!material) throw fail(400, 'Insumo não encontrado.');
    if (!material.active) throw fail(400, 'Insumo inativo.');
    if (material.technology !== equipment.technology)
      throw fail(400, 'O insumo não é compatível com a tecnologia do equipamento.');
    const {
      rows: [project],
    } = await client.query('SELECT * FROM projects WHERE id=$1', [input.project_id]);
    if (!project || !project.active) throw fail(400, 'Projeto não encontrado ou inativo.');
    if (req.user.role !== 'manager' && project.owner_id !== req.user.id)
      throw fail(403, 'Você só pode agendar um projeto sob sua responsabilidade.');
    const endedAt = bookingEnd(startedAt, input.duration_min);
    const conflict = await client.query(
      `SELECT 1 FROM bookings
       WHERE equipment_id=$1 AND status IN ('scheduled','confirmed','in_progress')
         AND started_at < $3::timestamptz
         AND started_at + duration_min * interval '1 minute' > $2::timestamptz
       LIMIT 1`,
      [input.equipment_id, startedAt.toISOString(), endedAt.toISOString()],
    );
    if (conflict.rowCount) throw fail(409, 'Já existe um agendamento que conflita com este horário.');
    if (Number(material.reserved) + input.material_grams > Number(material.physical) && !input.confirm_low_stock)
      return { warning: 'Saldo insuficiente', requires_confirmation: true };
    const {
      rows: [booking],
    } = await client.query(
      `INSERT INTO bookings
        (user_id,equipment_id,material_id,project_id,started_at,duration_min,material_grams,notes,idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        req.user.id,
        input.equipment_id,
        input.material_id,
        input.project_id,
        startedAt.toISOString(),
        input.duration_min,
        input.material_grams,
        input.notes,
        idempotencyKey,
      ],
    );
    await client.query('UPDATE materials SET reserved=reserved+$1 WHERE id=$2', [
      input.material_grams,
      input.material_id,
    ]);
    await client.query(
      `INSERT INTO stock_movements(material_id,author_id,quantity,resulting_balance,reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        input.material_id,
        req.user.id,
        -input.material_grams,
        material.physical,
        `Reserva automática - booking ${booking.id}`,
      ],
    );
    return { id: booking.id, replayed: false };
  });
  if (result.warning) return res.status(200).json(result);
  res.status(result.replayed ? 200 : 201).json(await bookingDetails(result.id));
});
app.patch('/api/bookings/:id/cancel', async (req, res) => {
  const id = bookingId(req);
  const { reason } = cancelBookingSchema.parse(req.body);
  const booking = await transaction(async (client) => {
    const {
      rows: [current],
    } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [id]);
    if (!current) throw fail(404, 'Agendamento não encontrado.');
    if (req.user.role !== 'manager' && current.user_id !== req.user.id)
      throw fail(403, 'Você não pode cancelar este agendamento.');
    if (!['scheduled', 'confirmed'].includes(current.status))
      throw fail(409, 'Agendamento não pode ser cancelado neste status.');
    const {
      rows: [material],
    } = await client.query(
      'UPDATE materials SET reserved=reserved-$1 WHERE id=$2 AND reserved >= $1 RETURNING physical',
      [current.material_grams, current.material_id],
    );
    if (!material) throw fail(409, 'A reserva de estoque já foi alterada; recarregue o agendamento.');
    await client.query(
      `INSERT INTO stock_movements(material_id,author_id,quantity,resulting_balance,reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        current.material_id,
        req.user.id,
        current.material_grams,
        material.physical,
        `Devolução - cancelamento booking ${id}`,
      ],
    );
    return (
      await client.query(
        `UPDATE bookings SET status='cancelled',cancel_reason=$1,cancelled_at=now(),updated_at=now()
         WHERE id=$2 RETURNING id`,
        [reason, id],
      )
    ).rows[0];
  });
  res.json(await bookingDetails(booking.id));
});
app.patch('/api/bookings/:id/reschedule', async (req, res) => {
  const id = bookingId(req);
  const input = rescheduleBookingSchema.parse(req.body);
  const startedAt = new Date(input.started_at);
  if (startedAt <= new Date()) throw fail(400, 'O início do agendamento deve estar no futuro.');
  const updated = await transaction(async (client) => {
    const {
      rows: [current],
    } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [id]);
    if (!current) throw fail(404, 'Agendamento não encontrado.');
    if (req.user.role !== 'manager' && current.user_id !== req.user.id)
      throw fail(403, 'Você não pode reagendar este agendamento.');
    if (!['scheduled', 'confirmed'].includes(current.status))
      throw fail(409, 'Somente agendamentos previstos podem ser reagendados.');
    const endedAt = bookingEnd(startedAt, input.duration_min);
    const conflict = await client.query(
      `SELECT 1 FROM bookings
       WHERE id<>$1 AND equipment_id=$2 AND status IN ('scheduled','confirmed','in_progress')
         AND started_at < $4::timestamptz
         AND started_at + duration_min * interval '1 minute' > $3::timestamptz
       LIMIT 1`,
      [id, current.equipment_id, startedAt.toISOString(), endedAt.toISOString()],
    );
    if (conflict.rowCount) throw fail(409, 'Já existe um agendamento que conflita com este horário.');
    return (
      await client.query(
        `UPDATE bookings SET started_at=$1,duration_min=$2,updated_at=now() WHERE id=$3 RETURNING id`,
        [startedAt.toISOString(), input.duration_min, id],
      )
    ).rows[0];
  });
  res.json(await bookingDetails(updated.id));
});
app.patch('/api/bookings/:id/status', async (req, res) => {
  const id = bookingId(req);
  const input = transitionBookingSchema.parse(req.body);
  const updated = await transaction(async (client) => {
    const {
      rows: [current],
    } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [id]);
    if (!current) throw fail(404, 'Agendamento não encontrado.');
    if (req.user.role !== 'manager' && current.user_id !== req.user.id)
      throw fail(403, 'Você não pode atualizar este agendamento.');
    const allowed = {
      scheduled: ['confirmed'],
      confirmed: ['in_progress'],
      in_progress: ['done', 'interrupted'],
    };
    if (!allowed[current.status]?.includes(input.status))
      throw fail(409, 'Transição de status não permitida.');
    if (input.status === 'interrupted' && !input.reason)
      throw fail(400, 'Informe o motivo da interrupção.');
    if (!['done', 'interrupted'].includes(input.status))
      return (
        await client.query(
          'UPDATE bookings SET status=$1,updated_at=now() WHERE id=$2 RETURNING id',
          [input.status, id],
        )
      ).rows[0];
    const actual = input.actual_material_grams ?? Number(current.material_grams);
    const {
      rows: [material],
    } = await client.query(
      `UPDATE materials
       SET physical=physical-$1,reserved=reserved-$2
       WHERE id=$3 AND physical >= $1 AND reserved >= $2
       RETURNING physical`,
      [actual, current.material_grams, current.material_id],
    );
    if (!material) throw fail(409, 'Saldo físico insuficiente para registrar o consumo real.');
    await client.query(
      `INSERT INTO stock_movements(material_id,author_id,quantity,resulting_balance,reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        current.material_id,
        req.user.id,
        -actual,
        material.physical,
        `Consumo real - booking ${id}`,
      ],
    );
    return (
      await client.query(
        `UPDATE bookings SET status=$1,actual_material_grams=$2,interrupted_reason=$3,
           completed_at=now(),updated_at=now() WHERE id=$4 RETURNING id`,
        [input.status, actual, input.status === 'interrupted' ? input.reason : null, id],
      )
    ).rows[0];
  });
  res.json(await bookingDetails(updated.id));
});
app.use('/api', (_req, res) => res.status(404).json({ message: 'Recurso não encontrado.' }));
if (config.production) {
  app.use(express.static(fileURLToPath(new URL('../../web/dist/', import.meta.url))));
  app.get('/{*path}', (_req, res) =>
    res.sendFile(fileURLToPath(new URL('../../web/dist/index.html', import.meta.url))),
  );
}
app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      message: 'Confira os campos informados.',
      fields: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  if (error.code === '23505')
    return res
      .status(409)
      .json({ message: 'Já existe um cadastro com este identificador ou nome.' });
  if (error.code === '23503')
    return res.status(400).json({ message: 'O cadastro relacionado não foi encontrado.' });
  if (error.type === 'entity.parse.failed')
    return res.status(400).json({ message: 'JSON inválido.' });
  if (error.type === 'entity.too.large')
    return res.status(413).json({ message: 'Solicitação muito grande.' });
  if (!error.status) console.error(error);
  res.status(error.status || 500).json({
    message: error.status ? error.message : 'Não foi possível concluir. Tente novamente.',
  });
});
