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
