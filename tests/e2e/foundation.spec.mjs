import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
async function login(page, email = 'gestor@siges.local') {
  await page.goto('/');
  await page.getByLabel('E-mail institucional').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.SEED_PASSWORD);
  await page.getByRole('button', { name: 'Entrar no SIGES' }).click();
  await expect(page.getByRole('heading', { name: /(?:Bom dia|Boa tarde|Boa noite),/ })).toBeVisible();
}

test('entradas válidas repetidas não bloqueiam o usuário', async ({ page }) => {
  test.setTimeout(60000);
  for (let attempt = 0; attempt < 22; attempt++) {
    await login(page);
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page.getByRole('button', { name: 'Entrar no SIGES' })).toBeVisible();
  }
});
test('login inválido e sessão persistida após recarga', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-mail institucional').fill('gestor@siges.local');
  await page.getByLabel('Senha', { exact: true }).fill('Incorreta123');
  await page.getByRole('button', { name: 'Entrar no SIGES' }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha inválidos');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.SEED_PASSWORD);
  await page.getByRole('button', { name: 'Entrar no SIGES' }).click();
  await expect(page.getByRole('heading', { name: /Gestor/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Gestor/ })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await expect(page.getByText(/Atualizado às/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('dashboard.png'), fullPage: true });
  await page.route('**/api/auth/logout', async (route) => {
    // Simulate a slow connection so reload cannot race the logout request.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no SIGES' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar no SIGES' })).toBeVisible();
});
test('criar projeto, recarregar, editar e filtrar', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Projetos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo projeto' }).click();
  const name = 'Protótipo E2E ' + Date.now();
  await page.getByLabel('Nome do projeto').fill(name);
  await page.getByLabel('Descrição').fill('Projeto criado pelo fluxo real da interface.');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
  await page.getByRole('button', { name: 'Editar ' + name, exact: true }).click();
  await page.getByLabel('Cadastro ativo').uncheck();
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Filtrar situação').selectOption('inactive');
  await page.getByRole('textbox', { name: 'Buscar registros' }).fill(name);
  await expect(page.getByRole('cell', { name: 'Inativo', exact: true })).toBeVisible();
});
test('equipamento persiste e duplicidade é informada', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Equipamentos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo equipamento' }).click();
  const code = 'E2E-' + Date.now();
  await page.getByLabel('Identificador único').fill(code);
  await page.getByLabel('Modelo', { exact: true }).fill('Prusa de teste');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('cell', { name: code, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Novo equipamento' }).click();
  await page.getByLabel('Identificador único').fill(code);
  await page.getByLabel('Modelo', { exact: true }).fill('Duplicado');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('alert')).toContainText('Já existe');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
});
test('insumo, movimentação, saldo persistido e histórico', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Insumos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo insumo' }).click();
  const name = 'Resina E2E ' + Date.now();
  await page.getByLabel('Nome do insumo').fill(name);
  await page.getByLabel('Tecnologia e unidade').selectOption('RESIN');
  await page.getByLabel('Estoque mínimo (ml)', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Movimentar ' + name, exact: true }).click();
  await page.getByLabel('Quantidade (ml)', { exact: true }).fill('125.5');
  await page.getByLabel('Motivo', { exact: true }).fill('Reposição para validação E2E');
  await page.getByRole('button', { name: 'Registrar movimentação' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('textbox', { name: 'Buscar registros' }).fill(name);
  await expect(page.getByRole('row').filter({ hasText: name }).getByRole('cell').nth(1)).toHaveText('125,5');
  await page.getByRole('button', { name: 'Histórico de ' + name, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Reposição para validação E2E');
  await expect(page.getByRole('dialog')).toContainText('Gestor Maker');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Movimentar ' + name, exact: true }).click();
  await page.getByLabel('Quantidade (ml)', { exact: true }).fill('-999');
  await page.getByLabel('Motivo', { exact: true }).fill('Tentativa além do saldo');
  await page.getByRole('button', { name: 'Registrar movimentação' }).click();
  await expect(page.getByRole('alert')).toContainText('Saldo disponível insuficiente');
});
test('usuário comum tem interface limitada e API nega alteração', async ({ page }) => {
  await login(page, 'ana@siges.local');
  await page.getByRole('link', { name: 'Equipamentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestão de equipamentos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo equipamento' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Pessoas', exact: true })).toHaveCount(0);
  const denied = await page.request.post('/api/equipment', {
    headers: { 'X-SIGES-Request': '1' },
    data: {},
  });
  expect(denied.status()).toBe(403);
});

test('reserva é revisada antes da confirmação e impressão pode ser encerrada', async ({ page }) => {
  await login(page);
  const code = 'BOOK-' + Date.now();
  const equipment = await page.request.post('/api/equipment', { headers: { 'X-SIGES-Request': '1' }, data: { code, model: 'Impressora de teste', technology: 'FDM', location: 'Sala de testes', active: true } });
  expect(equipment.status()).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Novo agendamento' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').locator('select[name="equipment_id"]').selectOption({ label: `${code} · Sala de testes` });
  const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel('Data de início').fill(day);
  await page.getByLabel('Hora de início').fill('14:00');
  await page.getByLabel('Quantidade estimada (g)').fill('10');
  await page.getByRole('button', { name: 'Revisar agendamento' }).click();
  await expect(page.getByRole('heading', { name: 'Revise seu agendamento' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Agendamento criado com sucesso.')).toBeVisible();
  await page.getByRole('button', { name: 'Detalhes' }).first().click();
  await page.getByRole('button', { name: 'Registrar situação' }).click();
  await page.getByRole('button', { name: 'Detalhes' }).first().click();
  await page.getByRole('button', { name: 'Registrar situação' }).click();
  await page.getByRole('button', { name: 'Acompanhar' }).first().click();
  await page.getByLabel('Consumo real (g)').fill('8');
  await page.getByRole('button', { name: 'Registrar situação' }).click();
  await expect(page.getByText('Impressão concluída.')).toBeVisible();
});

test('programação de manutenção aparece na lista', async ({ page }) => {
  await login(page);
  const code = 'MAINT-' + Date.now();
  const equipment = await page.request.post('/api/equipment', { headers: { 'X-SIGES-Request': '1' }, data: { code, model: 'Impressora de teste', technology: 'FDM', location: 'Sala de testes', active: true } });
  expect(equipment.status()).toBe(201);
  await page.reload();
  await page.getByRole('link', { name: 'Manutenção' }).click();
  await page.getByRole('button', { name: 'Programar manutenção' }).click();
  await page.getByRole('dialog').locator('select[name="equipment_id"]').selectOption({ label: `${code} · Impressora de teste` });
  const day = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel('Data', { exact: true }).fill(day);
  await page.getByLabel('Início').fill('09:00');
  await page.getByLabel('Fim').fill('10:00');
  await page.getByLabel('Serviço / motivo').fill('Limpeza preventiva do equipamento');
  await page.getByRole('button', { name: 'Confirmar programação' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Limpeza preventiva do equipamento' }).first()).toBeVisible();
});
