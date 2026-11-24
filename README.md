# Campus Events API

API REST para cadastro de eventos de um campus. Outra pessoa consegue, com este documento, entender o objetivo, configurar o ambiente, executar a aplicação, validar os endpoints e acompanhar a pipeline de integração contínua.

[![CI](https://github.com/andreeeeeeeee/campus-events-api/actions/workflows/ci.yml/badge.svg)](https://github.com/andreeeeeeeee/campus-events-api/actions/workflows/ci.yml)

Ambiente publicado: [https://campus-events-api-8wlm.onrender.com](https://campus-events-api-8wlm.onrender.com)

## Sumário

- [Objetivo e contexto](#objetivo-e-contexto)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Execução local](#execução-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Docker](#docker)
- [Endpoints](#endpoints)
- [Testes](#testes)
- [Integração contínua](#integração-contínua)
- [Ambiente publicado](#ambiente-publicado)
- [Decisões técnicas](#decisões-técnicas)
- [Dificuldades e soluções](#dificuldades-e-soluções)
- [Limitações e evolução](#limitações-e-evolução)

## Objetivo e contexto

A Campus Events API registra eventos presenciais do campus: título, início, fim, sala e organizador. A regra central é impedir dois eventos sobrepostos na mesma sala e recusar um início que já tenha passado.

O projeto partiu do template [template-node-express](https://github.com/miikkaylisiurunen/template-node-express) (Node.js, Express, TypeScript e PostgreSQL) e ganhou o domínio de eventos em cima dessa base. O recurso `/people` permanece como herança do template e serve de referência para o padrão de rotas, validação e testes.

Repositório: [github.com/andreeeeeeeee/campus-events-api](https://github.com/andreeeeeeeee/campus-events-api).

## Funcionalidades

- Cadastro de evento em `POST /events`, com validação de corpo, exigência de data futura e detecção de conflito de sala.
- Health check da API em `GET /health` e health check da API com o banco em `GET /health/deep`.
- Listagem e cadastro de pessoas em `GET /people` e `POST /people`.
- Respostas de erro em JSON, com status HTTP coerente.
- Aplicação automática das migrações na subida do processo.
- Log de requisições e erros com Pino, com redação de `Authorization` e `Cookie` e cabeçalho `X-Request-Id`.

## Tecnologias

| Tecnologia | Uso |
| --- | --- |
| Node.js `>= 20` | Runtime. A imagem Docker e a cobertura da CI usam Node.js 22. |
| Express 5 | Servidor HTTP. |
| TypeScript | Tipagem estática. O build gera `dist/` com `tsc`. |
| PostgreSQL 17 | Banco de desenvolvimento, de teste e do serviço de CI. |
| Zod | Validação de ambiente e do corpo das requisições. |
| `pg` | Pool de conexões. |
| `node-pg-migrate` | Migrações versionadas em SQL. |
| Pino e `pino-http` | Logs estruturados. |
| Vitest e Supertest | Testes de domínio e de rotas HTTP. |
| ESLint e Prettier | Lint com `--max-warnings 0` e formatação. |
| Docker e Docker Compose | Imagem da API e bancos locais. |
| GitHub Actions | Build, lint, testes e artefato de cobertura. |
| Dependabot | Atualização semanal das dependências npm na branch `main`. |

As versões declaradas estão em [package.json](package.json).

## Arquitetura

A inicialização concentra a montagem da aplicação em factories. `src/index.ts` lê a configuração, aplica as migrações, cria o logger, as queries e o middleware, e só então sobe o servidor.

```mermaid
flowchart TD
  index[index.ts] --> config[getConfig]
  index --> migrate[applyMigrations]
  index --> queries[makeQueries]
  index --> middleware[makeMiddleware]
  index --> app[makeApp]
  app --> healthRoutes["/health"]
  app --> peopleRoutes["/people"]
  app --> eventsRoutes["/events"]
  eventsRoutes --> eventsController[eventsController]
  eventsController --> eventRules[eventRules]
  eventsController --> roomSchedule[roomSchedule]
  eventsController --> sql[queries]
  sql --> postgres[(PostgreSQL)]
```

Cada rota recebe um `AppContext` com `queries` e `middleware`. O controlador de eventos valida o corpo com Zod, consulta `isEventDateValid` e `findRoomConflict`, e só então grava. As regras de data e de intervalo ficam em funções puras, sem Express e sem banco, para serem testadas à parte.

```text
.
├── .github
│   ├── workflows          # ci.yml e lint.yml
│   └── dependabot.yml
├── migrations             # SQL aplicado na subida
├── src
│   ├── controllers        # people, events e health
│   ├── database           # pool, queries, tipos e migrate
│   ├── domain             # data futura e conflito de sala
│   ├── errors             # HttpError
│   ├── middleware         # log, 404 e tratamento de erro
│   └── routes             # rotas e testes HTTP
├── Dockerfile
├── docker-compose.yml
├── vitest.config.mts
└── .env.example
```

## Execução local

Requisitos: Node.js 20 ou superior e Docker em execução.

1. Clone o repositório e entre na pasta do projeto.

2. Copie o exemplo de ambiente.

   PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Shell Unix:

   ```sh
   cp .env.example .env
   ```

3. Instale as dependências e suba os bancos:

   ```sh
   npm install
   npm run db:up
   ```

4. Inicie o servidor de desenvolvimento. A API fica em [http://localhost:3001](http://localhost:3001).

   ```sh
   npm run dev
   ```

O processo de desenvolvimento aplica as migrações antes de escutar a porta. Se as credenciais mudarem no `.env`, o mesmo valor precisa constar no `docker-compose.yml`.

### Scripts

| Script | Efeito |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com recarga (`tsx watch`). |
| `npm start` | Servidor de produção a partir de `dist/index.js`. Exige `npm run build` antes. |
| `npm run build` | Compila TypeScript para `dist/`. |
| `npm run lint` | ESLint em todo o projeto, sem warnings permitidos. |
| `npm run lint:fix` | ESLint com correção automática. |
| `npm test` | Vitest em modo watch. A suíte completa usa o Postgres de teste. |
| `npm run test:coverage` | Uma execução com relatório de cobertura em texto e HTML (`coverage/`). |
| `npm run db:up` | Sobe `postgres-dev` e `postgres-test` em segundo plano. |
| `npm run db:down` | Para e remove os containers dos bancos. |

## Variáveis de ambiente

O arquivo [.env.example](.env.example) documenta os quatro valores usados pelo código. `src/config.ts` lê `PORT` e `DATABASE_URL`. Nos testes, `getConfig('TEST_')` lê as mesmas chaves com o prefixo `TEST_`.

| Variável | Exemplo local | Função |
| --- | --- | --- |
| `PORT` | `3001` | Porta do servidor de desenvolvimento. |
| `DATABASE_URL` | `postgres://api:password@localhost:4329/api_dev` | Conexão do ambiente de desenvolvimento. |
| `TEST_PORT` | `3002` | Porta reservada ao contexto de teste. A suíte atual exercita o app pelo Supertest, sem abrir essa porta. |
| `TEST_DATABASE_URL` | `postgres://api:password@localhost:4328/api_test` | Conexão isolada usada por `npm test`. |

Zod recusa a subida quando `PORT` não é um inteiro positivo ou quando `DATABASE_URL` está ausente. O `.env` fica fora do versionamento.

No Render, o serviço precisa receber `PORT` e `DATABASE_URL` apontando para o Postgres daquele ambiente. Os valores locais do exemplo servem só para a máquina de desenvolvimento.

## Banco de dados

O Compose sobe duas instâncias PostgreSQL 17, com usuário `api` e senha `password`:

| Serviço | Banco | Porta no host |
| --- | --- | --- |
| `postgres-dev` | `api_dev` | `4329` |
| `postgres-test` | `api_test` | `4328` |

As migrações ficam em `migrations/` e a tabela de controle se chama `migrations`.

- [migrations/1681229663482_create-tables.sql](migrations/1681229663482_create-tables.sql) cria `people` (`id`, `name`, `age`, `created_at`).
- [migrations/1757850000000_create-events.sql](migrations/1757850000000_create-events.sql) cria `events` (`id`, `title`, `starts_at`, `ends_at`, `room`, `organizer`, `created_at`). Horários usam `TIMESTAMP WITH TIME ZONE`.

`src/database/migrate.ts` aplica todas as migrações pendentes para cima na inicialização (`direction: 'up'`). Os testes de integração sobem o schema no `beforeAll`, limpam as linhas relevantes no `beforeEach` e revertem o schema no `afterAll`.

A consulta de eventos por sala devolve as colunas persistidas, inclusive `id` e `created_at`. A consulta de pessoas devolve apenas `name` e `age`.

## Docker

O Compose é o ambiente de banco local. Ele não sobe a API.

```sh
npm run db:up
npm run db:down
```

O [Dockerfile](Dockerfile) produz a imagem da API em dois estágios, ambos com `node:22-slim`:

1. O estágio `base` instala todas as dependências, copia o código e executa `npm run build`.
2. A imagem final instala só as dependências de produção, copia `dist/` e `migrations/`, define `NODE_ENV=production` e inicia com `npm start`.

As migrações precisam estar na imagem porque o processo as aplica ao conectar em `DATABASE_URL`. Para executar a imagem localmente, o Postgres do Compose precisa estar no ar e a URL do banco precisa ser alcançável de dentro do container (`host.docker.internal` no Docker Desktop, no lugar de `localhost`).

## Endpoints

Todas as respostas de sucesso e de erro usam `Content-Type: application/json`.

| Método | Caminho | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | — | `200` `{ "status": "healthy", "timestamp": "<ISO-8601>" }` | — |
| `GET` | `/health/deep` | — | `200`, mesmo corpo, depois de `SELECT 1` | `503` se o banco falhar |
| `GET` | `/people` | — | `200` lista de `{ "name", "age" }` | — |
| `POST` | `/people` | `{ "name": string, "age": number }` | `200` com a pessoa gravada | `400` se o corpo for inválido |
| `POST` | `/events` | ver abaixo | `201` com o evento gravado, incluindo `id` e `created_at` | `400` ou `409` |
| qualquer | rota inexistente | — | — | `404` |

`name` é texto não vazio, com espaços das pontas removidos. `age` é um número maior que zero e de no máximo 150.

Corpo de `POST /events`:

| Campo | Regra |
| --- | --- |
| `title` | Texto de 1 a 255 caracteres. |
| `starts_at` | Data interpretável. Precisa ser estritamente posterior ao instante atual. |
| `ends_at` | Data posterior a `starts_at`. |
| `room` | Texto de 1 a 255 caracteres. A comparação de sala é exata. |
| `organizer` | Texto de 1 a 255 caracteres. |

O intervalo de ocupação da sala é semiaberto: um evento pode começar no exato instante em que outro termina na mesma sala. Sobreposição parcial na mesma sala responde `409`. O mesmo horário em salas diferentes é aceito.

Erros seguem este formato, produzido por [src/middleware/index.ts](src/middleware/index.ts):

```json
{
  "status": 400,
  "message": "Invalid request",
  "name": "ZodError"
}
```

| Situação | `status` | `name` | `message` |
| --- | --- | --- | --- |
| Corpo rejeitado pelo Zod | `400` | `ZodError` | `Invalid request` |
| `starts_at` no passado ou igual a agora | `400` | `HttpError` | `starts_at deve ser no futuro` |
| Sala já ocupada naquele intervalo | `409` | `HttpError` | `já existe um evento nesta sala nesse horário` |
| Rota inexistente | `404` | `HttpError` | `Route not found` |
| Banco indisponível em `/health/deep` | `503` | `HttpError` | `Service unavailable` |
| Falha não prevista | `500` | `InternalServerError` | `Something went wrong` |

Exemplos contra a API local. Troque a base pela URL publicada para validar o Render. No PowerShell, `curl` é um alias de `Invoke-WebRequest`; use `curl.exe` para estes comandos.

Health check:

```sh
curl http://localhost:3001/health
curl http://localhost:3001/health/deep
```

Cadastro aceito (`201`):

```sh
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Palestra de Extensão\",\"starts_at\":\"2027-01-10T19:00:00Z\",\"ends_at\":\"2027-01-10T21:00:00Z\",\"room\":\"Auditório 1\",\"organizer\":\"Coordenação de Extensão\"}"
```

Corpo inválido ou término anterior ao início (`400`, `ZodError`):

```sh
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"\",\"starts_at\":\"2027-01-10T19:00:00Z\",\"ends_at\":\"2027-01-10T18:00:00Z\",\"room\":\"Auditório 1\",\"organizer\":\"Coordenação de Extensão\"}"
```

Início no passado (`400`, `HttpError`):

```sh
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Palestra antiga\",\"starts_at\":\"2020-01-01T00:00:00Z\",\"ends_at\":\"2020-01-01T02:00:00Z\",\"room\":\"Auditório 1\",\"organizer\":\"Coordenação de Extensão\"}"
```

Segundo evento sobreposto na mesma sala (`409`):

```sh
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Oficina\",\"starts_at\":\"2027-01-10T20:00:00Z\",\"ends_at\":\"2027-01-10T22:00:00Z\",\"room\":\"Auditório 1\",\"organizer\":\"Coordenação de Extensão\"}"
```

Horário adjacente na mesma sala, começando quando o primeiro termina (`201`):

```sh
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Mesa-redonda\",\"starts_at\":\"2027-01-10T21:00:00Z\",\"ends_at\":\"2027-01-10T22:00:00Z\",\"room\":\"Auditório 1\",\"organizer\":\"Coordenação de Extensão\"}"
```

Mesmo horário em outra sala (`201`):

```sh
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Monitoria\",\"starts_at\":\"2027-01-10T19:00:00Z\",\"ends_at\":\"2027-01-10T21:00:00Z\",\"room\":\"Sala 2\",\"organizer\":\"Coordenação de Ensino\"}"
```

Cadastro de pessoa (`200`):

```sh
curl -X POST http://localhost:3001/people \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Ada\",\"age\":36}"
```

## Testes

A suíte combina três camadas:

- **Domínio, sem banco.** [src/domain/eventRules.test.ts](src/domain/eventRules.test.ts) cobre data futura, data passada e o limite de igualdade com o instante atual, inclusive a diferença de 1 ms. [src/domain/roomSchedule.test.ts](src/domain/roomSchedule.test.ts) cobre adjacência, salas diferentes, sobreposição parcial e o limite de 1 ms antes do término.
- **Queries, com Postgres de teste.** [src/database/queries.test.ts](src/database/queries.test.ts) exercita `checkConnection`, listagem e inserção de pessoas.
- **Rotas, com Supertest e Postgres de teste.** [src/routes/events.test.ts](src/routes/events.test.ts), [src/routes/people.test.ts](src/routes/people.test.ts) e [src/routes/health.test.ts](src/routes/health.test.ts) sobem o app real, aplicam as migrações e conferem status, corpo e persistência. O health check profundo também simula falha de conexão com `vi.spyOn`.

O Vitest usa um único fork ([vitest.config.mts](vitest.config.mts)). O pool de `pg` é um singleton; execuções paralelas dividiriam a mesma conexão e as migrações de um arquivo interfeririam nas de outro.

Para rodar:

```sh
npm run db:up
npm test
```

`npm test` observa o código e executa de novo a cada alteração. Uma passagem única com cobertura:

```sh
npm run test:coverage
```

O relatório HTML fica em `coverage/`. A cobertura usa o provider V8 e os repórteres `text` e `html`.

O Postgres de teste precisa estar acessível em `TEST_DATABASE_URL` antes da suíte. Sem esse banco, os testes de queries e de rotas falham na migração.

## Integração contínua

Os workflows disparam em push para qualquer branch, em pull request, por `workflow_call` e por `workflow_dispatch`. Uma execução mais nova do mesmo workflow e da mesma ref cancela a anterior.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) tem dois jobs, ambos em matriz Node.js 20 e 22, com cache de npm a partir do `package-lock.json`:

- **Build.** `npm ci` e `npm run build`.
- **Test.** Sobe um serviço `postgres:17` (`api_test`, usuário `api`, senha `password`, porta `4328`) com health check `pg_isready`. Define `TEST_DATABASE_URL` e `TEST_PORT`. No Node.js 20 executa `npm test`. No Node.js 22 executa `npm run test:coverage` e publica o diretório `coverage/` como artefato `coverage-report`, retido por 14 dias.

[`.github/workflows/lint.yml`](.github/workflows/lint.yml) instala as dependências no Node.js 22 e executa `npm run lint`.

[`.github/dependabot.yml`](.github/dependabot.yml) abre, toda semana, pull requests de atualização npm contra a branch `main`.

O repositório não contém workflow de publicação. O deploy para o Render acontece fora dessas Actions.

## Ambiente publicado

A API está no Render:

[https://campus-events-api-8wlm.onrender.com](https://campus-events-api-8wlm.onrender.com)

`GET /health` e `GET /health/deep` respondem `{"status":"healthy","timestamp":"..."}` quando o processo e o Postgres do Render estão disponíveis. A instância gratuita adormece após um período sem tráfego; a primeira requisição depois disso pode levar cerca de um minuto até o serviço acordar. Vale repetir a chamada se a primeira expirar.

Validação mínima:

```sh
curl https://campus-events-api-8wlm.onrender.com/health
curl https://campus-events-api-8wlm.onrender.com/health/deep
```

Validação do cadastro, com datas futuras. O `POST` grava de fato no banco publicado; use uma sala de teste se quiser evitar ocupar uma sala real.

```sh
curl -X POST https://campus-events-api-8wlm.onrender.com/events \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Validação do ambiente\",\"starts_at\":\"2027-06-01T14:00:00Z\",\"ends_at\":\"2027-06-01T15:00:00Z\",\"room\":\"Sala de validação\",\"organizer\":\"Equipe do projeto\"}"
```

Uma segunda chamada com o mesmo corpo e a mesma sala deve responder `409`. Um corpo com `starts_at` no passado deve responder `400`.

## Decisões técnicas

- As regras de data futura e de conflito de sala ficam em `src/domain`, fora do controlador. Assim os casos de limite (igual a agora, 1 ms, adjacência de intervalo) têm teste unitário sem Postgres.
- Zod valida o ambiente na subida e o corpo na borda HTTP. Regra de negócio que depende do relógio ou do estado do banco fica depois do parse, como `HttpError`.
- O conflito de sala é calculado na aplicação: `listEventsByRoom` carrega os eventos da sala e `findRoomConflict` compara intervalos. A tabela `events` não tem constraint de exclusão.
- Controladores, queries e middleware são factories que recebem dependências (`makeApp`, `makeQueries`, `makeMiddleware`). Os testes montam o mesmo app com um logger silencioso e o banco de teste.
- As migrações rodam na inicialização. Subir a API com um banco vazio cria o schema antes de aceitar tráfego, o que também vale para a imagem Docker.
- Desenvolvimento e teste usam bancos, portas e variáveis separados, para a suíte poder apagar linhas e reverter migrações sem tocar em `api_dev`.
- A cobertura é gerada só no Node.js 22 e guardada como artefato, para o histórico da Action conservar o relatório sem duplicar o upload na matriz inteira.

## Dificuldades e soluções

- O README herdado do template descrevia apenas `/people` e o fluxo genérico do template. A documentação deste arquivo passa a descrever o domínio de eventos, os dois bancos, a imagem Docker e o ambiente no Render.
- No Windows, o Prettier acusava carriage return (`Delete ␍`) em `vitest.config.mts`. A correção foi normalizar o fim de linha do arquivo para LF, alinhado ao que o ESLint e o Prettier esperam no CI (Linux).
- Os testes de integração compartilham o singleton `getPool`. Rodar arquivos em paralelo fazia uma suíte encerrar o pool ou reverter migrações enquanto outra ainda consultava. `vitest.config.mts` fixa `pool: 'forks'` com `singleFork: true`, e cada arquivo de teste que abre conexão chama `pool.end()` no `afterAll`.
- A checagem de sala lê e depois insere, em duas operações. Duas requisições simultâneas podem passar pela leitura antes de qualquer inserção e gravar sobreposição. A solução adotada no escopo atual é a verificação na aplicação, coberta por teste de domínio; a proteção transacional ficou como evolução.

## Limitações e evolução

O escopo entregue é o cadastro de eventos, o health check e o recurso de pessoas do template.

- A API grava eventos e não oferece listagem, edição nem cancelamento. Um `GET /events`, com filtro por sala e período, é o próximo passo natural.
- Inscrições de participantes e autenticação de organizadores estão fora deste código.
- `POST /people` responde `200` e devolve só `name` e `age`, como no template. O `id` existe na tabela e não sai na resposta.
- Dois cadastros simultâneos na mesma sala podem ambos receber `201`, porque a ocupação não é garantida por constraint no Postgres nem por transação com bloqueio.
- Corpo inválido no Zod responde `Invalid request`, sem o detalhe do campo rejeitado.
- O repositório não publica especificação OpenAPI. Os exemplos deste README são o contrato operacional.
- Não há workflow que publique a imagem a partir da `main`. O Render é atualizado fora do GitHub Actions.

Evoluções que se encaixam na arquitetura atual: `GET /events`, inscrições ligadas ao `id` do evento, autenticação antes de `POST /events`, constraint de exclusão por sala e intervalo, e um workflow de deploy disparado após a CI verde na `main`.
