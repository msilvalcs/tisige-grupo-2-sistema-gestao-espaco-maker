# Desenvolvimento do SIGES

## Entrega 01: base funcional

Monorepo com npm workspaces. Node.js 24+, API Express, React com Vite e PostgreSQL 17. A aplicação usa dados persistidos; não depende do estado do protótipo. A identidade visual parte das imagens existentes no repositório. Nenhuma alteração foi feita no Figma.

### Executar com Docker

1. Instale Node.js 24+ e Docker.
2. Na raiz: `npm ci`.
3. Copie `.env.example` para `.env` e defina uma senha de demonstração de pelo menos 12 caracteres.
4. Execute `docker compose up -d --wait`.
5. Execute `npm run db:migrate` e `npm run db:seed`.
6. Execute `npm run dev`.
7. Abra http://127.0.0.1:5173. API: http://127.0.0.1:3001/api/health.

A configuração Docker usa a porta 5432. Se ocupada, altere o mapeamento e DATABASE_URL juntos. O banco fica em volume persistente. O seed não sobrescreve senhas nem saldos existentes.

### Alternativa sem Docker

`npm run db:local` inicia PostgreSQL 17.6 real na porta 5433, com dados em `.local/postgres`. Mantenha esse terminal aberto e use `DATABASE_URL=postgres://siges:siges_local@127.0.0.1:5433/siges` no arquivo .env. Em outro terminal, execute as migrações, o seed e `npm run dev`. Esta alternativa é apenas para desenvolvimento e não altera instalações de PostgreSQL existentes.

### Acessos de demonstração

| Conta | Perfil | Senha |
| --- | --- | --- |
| gestor@siges.local | Gestor | Valor de SEED_PASSWORD no .env |
| ana@siges.local | Usuário | Valor de SEED_PASSWORD no .env |

O gestor cadastra pessoas, equipamentos e insumos e movimenta estoque. Usuários consultam equipamentos e insumos e gerenciam os próprios projetos. A API também aplica as permissões. Não há cadastro público nem redefinição de senha nesta entrega.

### Testar

- `npm run lint`: análise estática.
- `npm run format:check`: formatação do código.
- `npm run build`: compilação do frontend.
- `npm test`: integração HTTP com PostgreSQL real, criando e removendo somente um banco temporário de nome siges_test_UUID. A conta do banco precisa de CREATEDB para testes; a conta de produção não precisa dessa permissão.
- `npx playwright install chromium` e `npm run test:e2e`: testes reais de navegador em desktop e celular. Requerem migrações e seed. O Playwright inicia servidores exclusivos nas portas 3101 (API) e 5174 (frontend), sem reutilizar os servidores de desenvolvimento. O banco continua sendo o configurado por DATABASE_URL.
- Os testes de navegador criam registros com nomes E2E e não removem os dados existentes. Execute em banco de desenvolvimento ou em um banco exclusivo de teste. A integração contínua usa PostgreSQL descartável.
- O relatório navegável fica em playwright-report e capturas/traces de falhas em test-results.

### Restaurar cenários

Para uma nova massa, use um novo banco vazio e ajuste DATABASE_URL; execute migrações e seed. Não é necessário apagar o banco existente. O seed usa quantidades fixas, e a entrada inicial tem referência 22/10/2026 às 12h em America/Sao_Paulo. A interface usa o relógio real para informar consultas e novas movimentações. Nenhum relógio de produção é fixado.

### Produção

Execute migrações com a conta de implantação, `npm run build` e `npm start` com NODE_ENV=production. A API serve o frontend compilado. Use HTTPS em proxy reverso e valores próprios de DATABASE_URL; o cookie Secure exige HTTPS. O servidor escuta em 127.0.0.1 por padrão. Seed e banco embutido são exclusivos para desenvolvimento. Recuperação de senha, gestão de sessões, auditoria dos demais cadastros e infraestrutura de implantação ainda exigem entregas específicas.

## Estrutura

- apps/api/src: configuração, segurança, banco, rotas e servidor.
- apps/api/migrations: migrações SQL versionadas, executadas em transação e com trava.
- apps/web/src: interface React e estilos responsivos.
- tests: integração HTTP e testes de navegador.
- scripts: recursos locais de desenvolvimento.
- docs/requisitos-mvp.md: regras, propostas e rastreabilidade.
- docs/validacao-base.md: evidências e limites da entrega.

Quantidades são NUMERIC(12,3). O banco garante compatibilidade de tecnologia e unidade, saldo não negativo e reservado menor ou igual ao físico. Saídas usam trava de linha e transação com histórico. Não há exclusão destrutiva dos cadastros na API.

## Próximas entregas pelas issues

1. Validar as decisões propostas em #4 e finalizar a identificação e os vínculos de #5 e #6.
2. Completar equipamentos (#8), status (#9) e manutenção (#10).
3. Completar filtros, paginação e características de insumos (#12), histórico (#13) e alertas (#14).
4. Implementar agenda (#16), conflitos (#17), integração atômica (#18) e ciclo completo (#19), depois da aprovação das regras.
5. Consolidar métricas (#21), refinamento visual e acessibilidade (#22).
6. Completar massa de manutenção e cenários (#24), integração E2E (#25) e testes com participantes (#26).

Cada incremento deve compilar, manter testes verdes e atualizar a matriz de cobertura. Issues com critérios ainda pendentes permanecem abertas.
