# Validação dos módulos de agendamentos, manutenção e métricas

## Ambiente reproduzível

O projeto usa PostgreSQL 17 embutido para desenvolvimento local. O banco de demonstração é iniciado com:

```powershell
$env:DATABASE_URL = 'postgres://siges:siges_local@127.0.0.1:5433/siges'
npm run db:local
```

Em outro terminal, aplicar o schema e a massa determinística:

```powershell
$env:DATABASE_URL = 'postgres://siges:siges_local@127.0.0.1:5433/siges'
$env:SEED_PASSWORD = 'SenhaDeTeste123!'
npm run db:migrate
npm run db:seed
```

O seed cria o gestor `gestor@siges.local`, o usuário `ana@siges.local`, um projeto de referência, equipamentos FDM e RESIN, materiais regular/baixo/zero e uma manutenção preventiva. As datas gravadas no seed são fixas; os cenários de agendamento dos testes usam o relógio corrente para garantir que o início esteja no futuro.

O fuso de apresentação é `America/Sao_Paulo`. Datas de manutenção são comparadas com `CURRENT_DATE`; os endpoints retornam `status=ok` ou `status=overdue` sem persistir um status duplicado.

## Comandos de validação

```powershell
$env:DATABASE_URL = 'postgres://siges:siges_local@127.0.0.1:5433/siges'
npm run lint
npm test
npm run build
npm run test:e2e
```

`tests/api.test.mjs` valida a base já existente. `tests/scheduling.test.mjs` cobre criação idempotente, reserva e devolução de insumo, conflito concorrente, saldo insuficiente com confirmação, ciclo de execução, manutenção, dashboard, métricas e permissões.

## Rastreabilidade das issues

- #16: listagem/criação de agendamentos, validações e resumo no modal.
- #17: conflito no servidor com lock do equipamento, equipamento inativo e revalidação na confirmação.
- #18: reserva atômica do material, movimentações de estoque e chave `Idempotency-Key`.
- #19: cancelamento, reagendamento, transições de execução e consumo real.
- #21: dashboard e métricas derivados das mesmas tabelas de agenda, estoque e manutenção.
- #22: navegação, estados vazios/erro, foco de modal e layout responsivo alinhados aos protótipos.
- #24–#25: banco local, seed repetível e testes de integração reproduzíveis.

Os resultados de usabilidade da issue #26 devem ser registrados com participantes e roteiro antes de qualquer conclusão sobre ganho operacional; este repositório fornece os fluxos executáveis e seus dados de validação, mas não inventa resultados de usuários.
