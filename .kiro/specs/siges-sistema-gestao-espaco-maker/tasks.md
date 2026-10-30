# Implementation Plan: SIGES — Sistema Integrado de Gestão do Espaço Maker

## Overview

Este plano cobre apenas o que **falta** implementar no SIGES: os módulos de agendamentos, manutenção, dashboard e métricas (backend + frontend) e os testes de integração desses módulos. Tudo o que já está pronto — monorepo, Docker/PostgreSQL, scripts, lint, Playwright, autenticação (cookie `siges_session`), projetos, equipamentos, insumos/estoque, login, layout base, tabela genérica `Records`, modal genérico e a suíte de testes atual — **não é retrabalhado** aqui.

A stack é a **já adotada** pelo projeto (não a do design original, que previa Prisma/JWT/Axios): backend Node.js ESM (`.mjs`) com Express 5, `pg` direto via pool (sem ORM), Zod 4 e sessão por cookie HttpOnly + header CSRF `X-SIGES-Request: 1`; frontend React 19 com navegação por hash (sem React Router), `fetch` puro via `apps/web/src/lib/api.mjs`, ícones Lucide React e CSS em `apps/web/src/styles.css`; testes com `node:test` nativo sobre PostgreSQL real (banco temporário criado/destruído por execução).

Cada sub-tarefa adiciona código já integrado aos arquivos existentes (`apps/api/src/app.mjs`, `apps/web/src/main.jsx`, `apps/web/src/components/Modal.jsx`, `tests/api.test.mjs`), sem deixar nada órfão. Os testes de integração dos novos módulos são sub-tarefas opcionais marcadas com `*`. As propriedades de corretude do design são validadas pelos testes de integração (na stack `node:test` + pg real), com a devida anotação do número da propriedade.

## Tasks

- [ ] 1. Schema do banco — novos módulos
  - [ ] 1.1 Criar migration `002_scheduling.sql` com tabelas de agendamentos e manutenções
    - Criar `apps/api/migrations/002_scheduling.sql`; a `migrate()` existente aplica os arquivos `.sql` ordenados e os registra em `schema_migrations`, então o novo arquivo é aplicado automaticamente
    - Tabela `bookings` (PK `uuid DEFAULT gen_random_uuid()`): `user_id`, `equipment_id`, `material_id`, `project_id` (todas `uuid NOT NULL` com FK para `users`/`equipment`/`materials`/`projects`); `started_at timestamptz NOT NULL`; `duration_min int NOT NULL CHECK (BETWEEN 1 AND 1440)`; `material_grams numeric(12,3) NOT NULL CHECK (BETWEEN 1 AND 99999)`; `notes text NOT NULL DEFAULT ''`; `status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','in_progress','done','cancelled'))`; `cancel_reason text CHECK (length(cancel_reason) <= 255)`; `cancelled_at timestamptz`; `created_at timestamptz NOT NULL DEFAULT now()`
    - Tabela `maintenance_logs` (PK `uuid`): `equipment_id uuid NOT NULL` FK `equipment`; `performed_at date NOT NULL`; `description text NOT NULL CHECK (length(description) BETWEEN 5 AND 1000)`; `next_due date NOT NULL`; `created_by uuid NOT NULL` FK `users`; `created_at timestamptz NOT NULL DEFAULT now()`; `CHECK (next_due > performed_at)`
    - Índices: `bookings(equipment_id, started_at)` para verificação de conflito de horário; `bookings(started_at)` para a agenda do dia; `maintenance_logs(equipment_id, performed_at DESC)`
    - Afrouxar a restrição de `materials.reserved` para permitir reserva acima do físico quando o usuário confirmar saldo insuficiente: remover a parte `reserved <= physical` do CHECK (manter `reserved >= 0`), pois o aviso `requires_confirmation` permite criar agendamento mesmo com `reserved + material_grams > physical`
    - _Requirements: 3.3, 4.1, 7.1, 7.8, 8.4, 10.1_

- [ ] 2. Backend — Módulo de Agendamentos
  - [ ] 2.1 Implementar listagens GET `/api/bookings/mine` e GET `/api/bookings/today`
    - Em `apps/api/src/app.mjs`, usando `pool.query` e join em `equipment`/`projects`/`users` (estilo das rotas existentes)
    - `GET /api/bookings/mine`: agendamentos do `req.user.id`, ordenados por `started_at DESC`
    - `GET /api/bookings/today`: agendamentos onde `date(started_at) = current_date`, com horário, equipamento, responsável e status (base do dashboard)
    - _Requirements: 2.6, 4.1, 4.2_

  - [ ] 2.2 Implementar POST `/api/bookings` (validação, passado, conflito, equipamento ativo, reserva de material)
    - Schema Zod: `equipment_id`, `material_id`, `project_id` (uuid); `started_at` (datetime); `duration_min` (int 1-1440); `material_grams` (number 1-99999); `notes` (string, default ''); `confirm_low_stock` (boolean default false)
    - Rejeitar `started_at` no passado (comparar com `now()`) → 400; verificar equipamento ativo (`active=true`), senão → 400
    - Verificar sobreposição no mesmo equipamento: nenhum agendamento ativo (`status IN ('scheduled','confirmed','in_progress')`) cujo intervalo `[started_at, started_at + interval 'duration_min minutes')` se sobreponha → conflito retorna 409
    - Dentro de `transaction()`: travar o material (`SELECT ... FOR UPDATE`); se `reserved + material_grams > physical` e `confirm_low_stock=false` → retornar 200 `{ warning: 'Saldo insuficiente', requires_confirmation: true }` sem criar; se `confirm_low_stock=true` → criar mesmo assim aumentando `reserved`
    - Criar booking com `status='scheduled'` e `user_id=req.user.id`; inserir `stock_movements` negativo de reserva com `reason='Reserva automática - booking {id}'` (após obter o id do booking)
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

  - [ ] 2.3 Implementar PATCH `/api/bookings/:id/cancel` (status, motivo, devolução de reserva)
    - Schema Zod: `reason` (string trim 5-255); validar `id` uuid
    - Aceitar cancelamento apenas com `status IN ('scheduled','confirmed')`; senão → 409 "Agendamento não pode ser cancelado neste status."
    - Garantir que o agendamento pertence ao usuário (gestor pode cancelar qualquer um); senão → 403
    - Em `transaction()`: setar `status='cancelled'`, `cancel_reason`, `cancelled_at=now()`; devolver `material_grams` ao `materials.reserved` (diminuir); inserir `stock_movements` positivo com `reason='Devolução - cancelamento booking {id}'`
    - _Requirements: 4.3, 4.4, 8.6_

- [ ] 3. Backend — Módulo de Manutenção
  - [ ] 3.1 Implementar GET `/api/maintenance` e POST `/api/maintenance`
    - `GET /api/maintenance`: join `maintenance_logs` com `equipment` (código/modelo), ordenado por `performed_at DESC`; campo derivado `status`: `'overdue'` se `next_due < current_date`, `'ok'` se `next_due >= current_date`
    - `POST /api/maintenance` (middleware `manager`): schema Zod `equipment_id` (uuid), `performed_at` (date), `description` (string 5-1000), `next_due` (date, `> performed_at`); verificar equipamento existe → 404 se não; inserir com `created_by=req.user.id`
    - Nota: o equipamento usa apenas `active` (boolean), sem enum de status, então não há transição de status do equipamento ao registrar manutenção (Requisitos 7.5–7.7 não se aplicam a este modelo)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.8_

- [ ] 4. Backend — Dashboard e Métricas
  - [ ] 4.1 Implementar GET `/api/dashboard`
    - Saudação por faixa de horário do servidor: 05–11:59 "Bom dia", 12–17:59 "Boa tarde", 18–04:59 "Boa noite"
    - KPIs: `bookings_today` (count de bookings onde `date(started_at)=current_date`), `materials_alert` (count de materials ativos com `available <= minimum`), `active_equipment` (count `equipment.active`), `active_projects` (count `projects.active`)
    - `today_bookings`: array de agendamentos do dia com horário, equipamento, responsável e status (reaproveitar a consulta de `/api/bookings/today`)
    - `stock_alerts`: array de insumos ativos com `available <= minimum` (top 5), com nome, disponível, unidade, mínimo
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7_

  - [ ] 4.2 Implementar GET `/api/metrics` (apenas gestor)
    - Middleware `manager`
    - KPIs: `material_used_kg` (soma de `material_grams` de bookings `done` cujo material tem `technology='FDM'`, ÷1000, 1 casa decimal), `bookings_done` (count `status='done'`), `bookings_cancelled` (count `status='cancelled'`), `maintenance_count` (count de `maintenance_logs`)
    - `material_by_booking`: array de bookings `done` com FDM (nome do projeto, material, gramas)
    - `cancelled_bookings`: array de bookings `cancelled` (nome do projeto, `cancel_reason`, `cancelled_at`)
    - `maintenance_by_equipment`: array por impressora (código+modelo, último `performed_at`, próximo `next_due`, `horas` = `trunc(sum(duration_min de bookings done)/60)`, `status` 'ok'/'overdue' pelas regras dos Requisitos 7.3/7.4)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 5. Checkpoint A — Backend dos novos módulos pronto
  - Garantir que `migrate`, `seed` e os novos endpoints respondem; perguntar ao usuário caso surjam dúvidas.

- [ ] 6. Frontend — Módulo de Agendamentos
  - [ ] 6.1 Adicionar navegação e página de listagem "Agendamentos"
    - Em `apps/web/src/main.jsx`: adicionar `['bookings', 'Agendamentos', Calendar]` à const `navigation` (importar `Calendar` do `lucide-react`)
    - Página de listagem consumindo `GET /api/bookings/mine`: tabela com equipamento, projeto, data/hora (`started_at`), duração (`duration_min`), material, gramas e status (com `Badge` existente); ação "Cancelar" visível apenas para `scheduled`/`confirmed`; estado vazio com `Empty`
    - Integrar à carga de dados (estender `load()` ou buscar sob demanda ao visitar `#bookings`)
    - _Requirements: 4.1, 4.2, 4.5, 9.1_

  - [ ] 6.2 Implementar formulário de novo agendamento (modal)
    - Adicionar `kind: 'booking'` ao `Modal.jsx` (ou modal dedicado) em 3 seções: (1) equipamento em cards com código+modelo+tecnologia, desabilitado se `active=false`; (2) projeto (select dos projetos do usuário), material (select filtrado pela tecnologia do equipamento), data de início (`date`), hora (`time`), duração (1-1440 min), peso (1-99999 g); (3) observações (`textarea`)
    - Validação client-side: campos obrigatórios, data/hora não no passado, limites numéricos; ao submeter chamar `POST /api/bookings` via `api.mjs`
    - Tratar resposta 200 com `requires_confirmation: true` abrindo dialog de confirmação e reenviando com `confirm_low_stock: true`; tratar 409 (conflito de horário) exibindo erro inline; botão "Cancelar" descarta o formulário
    - O botão "+ Novo agendamento" do header já existe: redirecionar para `#bookings` e abrir este modal
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.8, 3.9, 2.8_

  - [ ] 6.3 Implementar cancelamento com diálogo de motivo
    - `ConfirmDialog` interno (ou `kind: 'cancel-booking'` no `Modal.jsx`) exigindo motivo (5-255 chars) ao acionar "Cancelar" em agendamentos `scheduled`/`confirmed`
    - Chamar `PATCH /api/bookings/:id/cancel` com `{ reason }`; atualizar a lista após sucesso; tratar 409 (status inválido) exibindo a mensagem do servidor
    - _Requirements: 4.3, 4.4, 8.6_

- [ ] 7. Frontend — Módulo de Manutenção
  - [ ] 7.1 Adicionar navegação, listagem e modal de registro de manutenção
    - Em `main.jsx`: adicionar `['maintenance', 'Manutenção', Wrench]` à `navigation` (importar `Wrench`)
    - Página de listagem consumindo `GET /api/maintenance`: tabela com equipamento, data de realização, próxima data prevista e status com `Badge` ('ok' → verde, 'overdue' → vermelho/warning); ação "+ Registrar" apenas para gestor
    - Modal de registro: adicionar `kind: 'maintenance'` ao `Modal.jsx` com campos — equipamento (select de equipment ativos), data de realização (`date`, ≤ hoje), descrição (5-1000 chars), próxima data prevista (`date`, > data de realização); chamar `POST /api/maintenance`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.8, 9.1_

- [ ] 8. Frontend — Módulo de Métricas
  - [ ] 8.1 Adicionar navegação e página de Métricas (visível apenas para gestor)
    - Em `main.jsx`: adicionar `['metrics', 'Métricas', BarChart2]` à `navigation` (importar `BarChart2`), filtrando para gestor (mesmo padrão já usado para `users`)
    - Página consumindo `GET /api/metrics`: 4 KPIs (filamento usado em kg, projetos concluídos, projetos cancelados, manutenções); tabela "Uso de filamento por agendamento" (nome do projeto, material, gramas); lista "Agendamentos cancelados" (projeto, motivo, data); tabela "Manutenções por equipamento" (equipamento, última, próxima, horas, status)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1_

- [ ] 9. Frontend — Dashboard com dados de agendamentos
  - [ ] 9.1 Atualizar o dashboard para consumir GET `/api/dashboard`
    - Em `main.jsx`: ao visitar `#dashboard`, chamar `GET /api/dashboard` em vez de derivar tudo do `load()` geral; exibir KPI "Agendamentos hoje" (`bookings_today`)
    - Substituir o card "A base da sua operação" pelo card "Agenda de hoje" com a lista `today_bookings` (horário, equipamento, responsável, status) quando houver dados; manter os KPIs e o card "Atenção ao estoque" usando `stock_alerts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7_

- [ ] 10. Checkpoint B — Frontend dos novos módulos pronto
  - Garantir que o build do frontend e a navegação entre os novos módulos funcionam; perguntar ao usuário caso surjam dúvidas.

- [ ] 11. Testes de integração — novos módulos
  - [ ]* 11.1 Escrever testes de criação de agendamento
    - Em `tests/api.test.mjs` (convenção `node:test` + pg real, helper `call`): criar booking com sucesso (201 + `materials.reserved` aumenta); conflito de horário no mesmo equipamento (409); equipamento inativo (400); `started_at` no passado (rejeição)
    - **Property 5: Rejeição de agendamentos com sobreposição de horário**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [ ]* 11.2 Escrever testes de cancelamento e de estoque reservado
    - Cancelar com motivo válido (status → `cancelled` e `reserved` devolve `material_grams`); cancelar status inválido (`in_progress`/`done`/`cancelled` → 409); dedução na criação e devolução no cancelamento preservam o saldo reservado
    - **Property 1: Dedução de estoque na criação; Property 2: Devolução no cancelamento; Property 3: Invariância em cancelamentos inválidos**
    - **Validates: Requirements 3.5, 4.3, 4.4, 8.6**

  - [ ]* 11.3 Escrever testes de manutenção
    - Registrar com gestor (201); sem gestor (403); validação de datas (`next_due > performed_at`, campos obrigatórios → 400); equipamento inexistente (404); listagem com `status` derivado `overdue`/`ok`
    - **Property 7: Status de manutenção consistente com a data prevista**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.8**

  - [ ]* 11.4 Escrever testes de `/api/dashboard`
    - Retorna `saudacao`, KPIs (`bookings_today`, `materials_alert`, `active_equipment`, `active_projects`), `today_bookings` e `stock_alerts` com os campos esperados
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 2.7**

  - [ ]* 11.5 Escrever testes de `/api/metrics`
    - Apenas gestor (usuário comum → 403); KPIs corretos (`material_used_kg`, `bookings_done`, `bookings_cancelled`, `maintenance_count`); tabelas `material_by_booking`, `cancelled_bookings`, `maintenance_by_equipment` (horas truncadas, status ok/overdue)
    - **Property 9: Filamento consumido em kg; Property 10: Horas de uso acumuladas**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [ ] 12. Checkpoint C — Ensure all tests pass
  - Garantir que todos os testes (existentes + novos módulos) passam; perguntar ao usuário caso surjam dúvidas.

## Notes

- Tarefas marcadas com `*` (sub-tarefas do grupo 11) são opcionais e podem ser omitidas para um MVP mais rápido, mas recomenda-se executá-las para validar as propriedades de corretude do design.
- Cada sub-tarefa referencia requisitos específicos para rastreabilidade entre tasks e especificação.
- Os checkpoints validam incrementalmente o progresso entre fases (backend, frontend, final).
- As propriedades de corretude do design são validadas pelos testes de integração na stack real (`node:test` + pg), não por fast-check (a stack do projeto não usa fast-check). Property 4 (status do insumo) já é coberta pelos testes existentes de estoque; as Properties 6 e 8 (transição de status e taxa de ocupação) não se aplicam ao modelo real de equipamento (apenas `active`, sem enum de status) e ao dashboard especificado.
- Os arquivos compartilhados `apps/api/src/app.mjs`, `apps/web/src/main.jsx`, `apps/web/src/components/Modal.jsx` e `tests/api.test.mjs` são editados uma sub-tarefa por vez (em ondas separadas no grafo de dependência) para evitar conflitos de escrita; cada sub-tarefa integra o que cria ao fluxo existente, sem código órfão.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "6.1"] },
    { "id": 3, "tasks": ["2.3", "6.2", "11.1"] },
    { "id": 4, "tasks": ["3.1", "6.3", "11.2"] },
    { "id": 5, "tasks": ["4.1", "7.1", "11.3"] },
    { "id": 6, "tasks": ["4.2", "9.1", "11.4"] },
    { "id": 7, "tasks": ["8.1", "11.5"] }
  ]
}
```
