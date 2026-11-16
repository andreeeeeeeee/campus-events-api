# Parte B — Alternativa de deploy: Fly.io

Este documento compara a solução usada na Parte A (Render) com uma alternativa de deploy para a Campus Events API: o **Fly.io**.

> essa alternativa foi **pesquisada na documentação**, não executada. Os comandos e o `fly.toml` abaixo são ilustrativos e devem ser conferidos na documentação oficial antes de uso real. https://fly.io/pricing.

## 1. Contexto: o que foi feito na Parte A

| Item | Solução da Parte A (Render) |
|---|---|
| API | Web Service Docker, plano Free, construído a partir do `Dockerfile` |
| Banco | PostgreSQL gerenciado do Render, acessado pela URL interna |
| Deploy | Automático a cada push na branch `main`, configurado pelo painel web |
| Variáveis | `DATABASE_URL` e `NODE_ENV` no painel; `PORT` injetada pelo Render |
| Migrations | Aplicadas pela própria aplicação ao iniciar (`src/index.ts`) |

## 2. Alternativa: Fly.io

### 2.1 Arquitetura geral

O Fly.io executa cada container Docker como uma **Machine**, uma micro-VM leve, e coloca um proxy na frente que roteia o tráfego HTTPS. O banco roda como um serviço separado dentro da mesma rede privada da organização.

```
Cliente (HTTPS)
      │
      ▼
 Fly Proxy  ── health check em /health ──┐
      │                                  │
      ▼                                  ▼
 Machine (container da API)  (só recebe tráfego se saudável)
      │  rede privada do Fly
      ▼
 Managed Postgres (mesma região)
```

### 2.2 Principais ferramentas e serviços

- **flyctl:** CLI usada para criar o app, configurar secrets e fazer deploy.
- **fly.toml:** arquivo de configuração do app (build, porta, health check, estratégia de deploy), versionado no repositório.
- **Fly Machines:** onde o container da API executa.
- **Fly Managed Postgres:** banco gerenciado, com backups automáticos e alta disponibilidade dentro de uma região.
- **Fly Proxy:** termina o HTTPS e só envia tráfego a Machines que passam no health check.
- **GitHub Actions (opcional):** para automatizar o `fly deploy` a cada push, usando um token de deploy guardado como secret do GitHub.

### 2.3 Onde a API e o banco rodam

- **API:** em uma Machine do Fly.io. A região pode ser `gru` (São Paulo), o que reduz a latência para usuários no Brasil. Na Parte A a região foi Virginia (EUA).
- **Banco:** em um cluster de Managed Postgres na mesma organização e, de preferência, na mesma região. O acesso é pela rede privada, sem expor o banco à internet.
- O Fly ainda tem o "Fly Postgres" não gerenciado (você mesmo cuida de backup, upgrade e failover). A documentação aponta que ele está sendo substituído pelo Managed Postgres, então a escolha recomendada para este projeto é o gerenciado.

### 2.4 Processo de build e deploy

O mesmo `Dockerfile` da Parte A pode ser reaproveitado sem alterações, porque ele já faz o build em duas etapas e inicia com `npm start`.

Passo a passo resumido:

1. Instalar o `flyctl` e autenticar: `fly auth login`.
2. Na raiz do projeto: `fly launch --no-deploy`. Isso gera o `fly.toml`.
3. Criar o banco: `fly mpg create` e ligar ao app com `fly mpg attach`. Segundo a documentação, o attach define o secret `DATABASE_URL` no app.
4. Ajustar o `fly.toml` (exemplo abaixo).
5. Publicar: `fly deploy`. O Fly constrói a imagem (em um builder remoto), envia ao registry e atualiza as Machines.
6. Validar: `fly status`, `fly logs` e `curl https://<app>.fly.dev/health`.

Exemplo ilustrativo de `fly.toml`:

```toml
app = "campus-events-api"
primary_region = "gru"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "8080"            # a API lê PORT de process.env (src/config.ts)

[http_service]
  internal_port = 8080     # precisa ser igual à PORT acima
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    path = "/health"
    timeout = "5s"

[deploy]
  strategy = "rolling"
```

**Estratégias de deploy disponíveis:** `rolling` (padrão: troca as Machines aos poucos), `canary` (sobe uma Machine nova, valida e depois segue), `bluegreen` (sobe um conjunto novo, valida e então troca o tráfego) e `immediate` (substitui tudo sem esperar health checks).

**Migrations:** hoje a aplicação roda as migrations ao iniciar. O Fly também oferece o `release_command`, que executa um comando uma vez, em uma VM temporária, antes de liberar a nova versão, e cancela o deploy se falhar. Para usá-lo, seria preciso um script de migration separado do `src/index.ts`. Manter as migrations no startup continua funcionando, principalmente com uma única Machine.

**CI/CD opcional:** um workflow do GitHub Actions pode executar `flyctl deploy --remote-only` a cada push na `main`, com o token em `secrets.FLY_API_TOKEN`.

### 2.5 Variáveis de ambiente e secrets

- **Não sensíveis** (`NODE_ENV`, `PORT`): vão na seção `[env]` do `fly.toml` e ficam versionadas.
- **Sensíveis** (`DATABASE_URL`): definidas com `fly secrets set DATABASE_URL=...` ou pelo `fly mpg attach`. Ficam guardadas de forma criptografada e são injetadas como variáveis de ambiente quando a Machine inicia.
- Para a aplicação, não há diferença: ela lê `process.env.DATABASE_URL` normalmente (`src/config.ts`), sem alterar código.
- Como nas outras plataformas, quem tem permissão de deploy pode fazer o código ler e imprimir o secret, então o acesso à organização precisa ser controlado.
- Um ponto a validar na prática: o `src/database/pool.ts` não configura SSL. Seria preciso confirmar se a string de conexão do Managed Postgres exige SSL e, se exigir, ajustar a URL ou o código.

### 2.6 Possibilidade de rollback

O Fly guarda o histórico de releases com a imagem usada em cada uma.

```bash
fly releases --image                                  # lista releases e imagens
fly deploy --image registry.fly.io/campus-events-api:v1.2.3
fly deploy --image <imagem> --strategy immediate      # rollback mais rápido, sem esperar checks
```

Para facilitar, dá para marcar cada deploy com `fly deploy --image-label v1.2.3`.

**Limitações do rollback:**
- Não existe um comando único de rollback: o procedimento é reimplantar uma imagem antiga.
- O rollback usa o `fly.toml` e os secrets **atuais**, e não os da época daquela versão.
- Migrations já aplicadas no banco **não** são desfeitas. Por isso, mudanças de schema devem ser compatíveis com a versão anterior do código.

### 2.7 Vantagens e limitações

| Vantagens | Limitações |
|---|---|
| Região em São Paulo (`gru`), menor latência para o Brasil | **Sem plano gratuito contínuo** para contas novas: há apenas um teste curto e é preciso cadastrar cartão |
| Mesmo `Dockerfile` da Parte A, sem mudar o código | Cobrança por uso (Machines, volumes, IPs, tráfego), mais difícil de prever |
| Configuração versionada em `fly.toml` (infraestrutura como código) | Managed Postgres tem custo bem maior que o banco gratuito do Render |
| Várias estratégias de deploy (rolling, canary, blue-green) com health check antes de receber tráfego | Rollback manual e sem reverter secrets nem migrations |
| Machines podem parar quando ociosas e iniciar sob demanda | Exige usar a CLI e entender conceitos próprios (Machines, regiões, proxy) |

## 3. Comparação com a Parte A

| Critério | Render (Parte A) | Fly.io |
|---|---|---|
| Configuração inicial | Pelo painel web, poucos cliques | CLI + `fly.toml`; mais passos |
| Custo para este trabalho | Gratuito (banco expira em ~30 dias) | Pago por uso após o teste curto |
| Deploy | Automático a cada push, sem configuração extra | Manual por `fly deploy`, ou automático via GitHub Actions |
| Banco | PostgreSQL gerenciado, URL interna | Managed Postgres, rede privada, anexado com `fly mpg attach` |
| Secrets | Painel do serviço | `fly secrets set` / `fly mpg attach` |
| Rollback | Pelo painel, reimplantando um deploy anterior | Reimplantação de imagem anterior por CLI |
| Controle e flexibilidade | Menor, mais "pronto" | Maior (região, estratégia, escala, rede) |
| **Complexidade geral** | **Baixa** | **Média**: mais controle, mais conceitos e mais configuração |

**Conclusão:** para um trabalho acadêmico com custo zero e entrega rápida, o Render é mais adequado. O Fly.io faria sentido em um cenário de produção real, em que se precisa de região próxima dos usuários, estratégias de deploy mais seguras e configuração versionada, aceitando mais complexidade e custo.

## Fontes consultadas

- Fly.io, Pricing: https://fly.io/pricing
- Fly.io, Managed Postgres: https://fly.io/docs/mpg e https://fly.io/mpg
- Fly.io, Fly Postgres (não gerenciado): https://fly.io/docs/postgres/
- Fly.io, Deploy: https://fly.io/docs/launch/deploy/
- Fly.io, Seamless deployments: https://www.fly.io/docs/blueprints/seamless-deployments/
- Fly.io, Rollback guide: https://www.fly.io/docs/blueprints/rollback-guide/
- Fly.io, Secrets: https://fly.io/docs/apps/secrets
