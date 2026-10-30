# Executar o SIGES com PostgreSQL no Docker

Este guia inicia apenas o PostgreSQL em um contêiner Docker. A API Express e o frontend Vite continuam sendo executados localmente com Node.js.

## Pré-requisitos

- Docker Desktop iniciado, com o modo Linux/WSL disponível;
- Node.js 24 ou superior;
- dependências instaladas na raiz do projeto: `npm ci`.

Confirme que o Docker está pronto:

```powershell
docker version
docker compose config --quiet
```

O arquivo [compose.yaml](../compose.yaml) cria o serviço `db` a partir da imagem `postgres:17-alpine`. O banco é exposto somente em `127.0.0.1:5432`, com dados persistidos no volume nomeado `postgres_data`.

## 1. Criar a configuração local

O arquivo `.env` não é versionado. Crie-o na raiz do projeto com os valores abaixo:

```dotenv
DATABASE_URL=postgresql://siges:siges_local@127.0.0.1:5432/siges
PORT=3001
SEED_PASSWORD=SenhaDeTeste123!
NODE_ENV=development
```

`SEED_PASSWORD` precisa ter pelo menos 12 caracteres. Ela será a senha das duas contas de demonstração quando o seed for executado em um banco vazio.

> O `POSTGRES_PASSWORD` do contêiner é `siges_local` por padrão. Caso seja alterado ao subir o Compose, ajuste também a senha presente em `DATABASE_URL`.

## 2. Subir o PostgreSQL

Na raiz do repositório, execute:

```powershell
docker compose up -d --wait db
docker compose ps
```

O resultado esperado para `db` é `healthy`, com a porta `127.0.0.1:5432->5432/tcp`.

## 3. Aplicar estrutura e dados de demonstração

Com o contêiner saudável, execute:

```powershell
npm run db:migrate
npm run db:seed
```

As migrações são registradas em `schema_migrations`, por isso podem ser executadas novamente sem reaplicar arquivos já concluídos. O seed cria, quando ainda não existem:

- `gestor@siges.local` — perfil de gestor;
- `ana@siges.local` — perfil de usuário;
- projeto, equipamentos, insumos e manutenção de exemplo.

As duas contas usam o valor de `SEED_PASSWORD` definido no `.env` na primeira execução. O seed é idempotente e não substitui senhas ou saldos existentes.

## 4. Iniciar a aplicação

```powershell
npm run dev
```

Endereços locais:

- Interface: http://127.0.0.1:5173
- Saúde da API: http://127.0.0.1:3001/api/health

Use uma das contas de demonstração e o valor atual de `SEED_PASSWORD`.

## 5. Validar rapidamente

Em outro terminal PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health

$payload = @{
  email = 'gestor@siges.local'
  password = 'SenhaDeTeste123!'
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri 'http://127.0.0.1:3001/api/auth/login' `
  -Method Post `
  -ContentType 'application/json' `
  -Headers @{ 'X-SIGES-Request' = '1' } `
  -Body $payload
```

O primeiro comando deve retornar `status: ok` e `database: connected`. O segundo deve retornar o usuário autenticado. O cabeçalho `X-SIGES-Request` é exigido pela proteção da API para requisições que alteram estado, inclusive login.

## Parar ou recriar o banco

Para parar o contêiner, preservando os dados:

```powershell
docker compose stop db
```

Para retomá-lo:

```powershell
docker compose up -d --wait db
```

Para apagar completamente os dados locais do PostgreSQL e começar de novo, pare os serviços e execute o comando abaixo. **Ele remove o volume `postgres_data` e não pode ser desfeito.**

```powershell
docker compose down -v
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
```

## Solução de problemas

### Docker não responde

Inicie o Docker Desktop e aguarde o backend Linux/WSL ficar disponível. Confirme com:

```powershell
docker desktop status
docker version
```

### Porta 5432 ocupada

Altere o mapeamento de portas em `compose.yaml` e ajuste a mesma porta em `DATABASE_URL`. Por exemplo, se usar `127.0.0.1:5434:5432`, a URL deve usar `127.0.0.1:5434`.

### Login rejeitado após mudar a senha do `.env`

O seed não atualiza usuários que já existem. Mantenha a senha que foi usada na primeira execução ou recrie o volume local seguindo a seção anterior, apenas se os dados puderem ser descartados.

### Porta 5173 ocupada

Identifique a instância existente antes de encerrá-la. Se ela for outra execução do SIGES, use-a ou pare o processo correspondente e execute `npm run dev` novamente.
