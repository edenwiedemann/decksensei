# Deck Sensei

## Visão geral

Web app de análise estratégica de decks de TCG por IA, em português brasileiro.
Projeto pai-e-filho: pai cuida da parte técnica, filho (jogador competitivo de Digimon em Recife/PE) é a voz pública.

**Jogo atual:** Digimon Card Game (BT21 Standard EN).
**Arquitetura:** TCG-agnóstica — o jogo é sempre parâmetro de URL/schema, nunca hardcode.

## Stack

- **Framework:** Next.js 15.5 (`^15.3.0`, instalado 15.5.15) + App Router + TypeScript strict mode
- **Estilo:** Tailwind CSS v4 + shadcn/ui
- **Banco:** PostgreSQL (Replit) + Drizzle ORM
- **IA:** Anthropic SDK (`@anthropic-ai/sdk`) — motor de análise via streaming
- **Email:** Resend — magic link login + envio de análise
- **Analytics:** posthog-js (`NEXT_PUBLIC_POSTHOG_KEY`) — tracking de fallbacks/erros de formato
- **Monorepo:** pnpm workspaces

## Estrutura de pastas (artifact: decksensei)

```
artifacts/decksensei/
  app/
    [game]/page.tsx         ← landing por jogo (ex: /digimon)
    [game]/_components/     ← DeckInput, AnalysisResult, etc.
    admin/                  ← painel admin (protegido por middleware)
      login/page.tsx
      analyses/page.tsx
      feedback/page.tsx
      games/page.tsx           ← lista jogos com stats
      games/new/page.tsx       ← formulário de novo jogo
      games/[id]/edit/page.tsx ← edição de jogo existente
      meta/[id]/page.tsx
      prompts/page.tsx
      users/page.tsx
      users/[id]/page.tsx
    api/
      analyze/route.ts      ← POST /api/analyze — streaming Anthropic
      auth/request-magic-link/route.ts
      feedback/route.ts
      health/route.ts
      admin/
        login/route.ts      ← POST /api/admin/login (excluída do middleware)
        analyses/recent/route.ts
        card-search/route.ts  ← GET ?game=&q= — usa config do DB (genérico)
        featured/set/route.ts
        games/route.ts        ← POST criar jogo
        games/[id]/route.ts   ← PUT atualizar, DELETE remover jogo
        games/test/route.ts   ← POST testar config (parser + card_api + validator)
        meta/snapshots/     ← CRUD de snapshots e arquétipos
        prompts/            ← CRUD de prompts
        users/export/route.ts
    layout.tsx
    globals.css
  lib/
    env.ts                  ← validação de env vars no boot
    auth/admin.ts           ← requireAdmin, requireAdminCookie, adminSessionValue
    games/
      types.ts              ← interfaces TCG-agnósticas (DeckParser, CardAPI, DeckValidator, etc.)
      index.ts              ← getParser(cfg), getCardAPI(cfg), getValidator(cfg) — dispatch por config
      generic/
        rate-limiter.ts     ← SerialRateLimiter (configurable max/window)
        parser.ts           ← GenericDeckParser (lê line_patterns, section_markers do config)
        card-api.ts         ← GenericCardAPI (lê url_template, field_mapping do config)
        validator.ts        ← GenericDeckValidator (lê main_deck_size, aux_decks do config)
      list.ts               ← getGames() — lista jogos do DB
    game-config.ts          ← GameConfig + ParserConfig + CardApiConfig + ValidatorConfig
    analysis-prompt.ts
  middleware.ts             ← protege /admin/* e /api/admin/* (exceto login)
  public/
    logo.png                ← logo original (usar com mix-blend-mode: screen)
    logo-transparent.png    ← bg removido
    favicon.svg
    opengraph.jpg
```

## Schema do banco

Tabelas TCG-agnósticas — todas com `game_id`:

- `games` — jogos suportados (sem coluna `active` — ativação é via `meta_snapshots`)
- `users` + `magic_tokens` + `sessions` — autenticação por magic link
- `meta_snapshots` — snapshots do meta em JSONB (archetypes dentro de `json_content`, não tabela separada)
- `prompts` — system prompts versionados por jogo
- `analyses` — análises geradas (ID nanoid público); coluna `deck_text` (não `decklist_raw`)
- `analysis_feedback` — upvote/downvote de análises
- `api_costs` — registro de custo por chamada Anthropic
- `rate_limits` — controle de rate limit
- `meta_archetype_evidences` — evidências coletadas por pipeline (resultados de torneios, listas públicas, etc.)
- `pipeline_health` — log de execuções de pipeline de coleta de evidências
- **Não existe** tabela `meta_archetypes` — arquétipos vivem em `meta_snapshots.json_content`

## Estado atual do banco (desenvolvimento)

- 1 game: `digimon` (Digimon Card Game)
- 1 prompt: id=1, game_id=digimon, version=v1, active=true
- 2 meta snapshots: id=1 (global, active), id=2 (local recife-v1, inactive)
- 0 analyses, 0 users

## Variáveis de ambiente obrigatórias

Ver `.env.example`. Configuradas no Replit:
- `DATABASE_URL` — auto-injetada pelo Postgres do Replit
- `ANTHROPIC_API_KEY` — secret
- `RESEND_API_KEY` — secret
- `ADMIN_EMAIL` — e-mail único que faz login no `/admin` (obrigatório)
- `ADMIN_TOKEN` — senha do painel `/admin`, usada junto com `ADMIN_EMAIL` (obrigatório)
- `APP_URL` — usa `REPLIT_DOMAINS` como fallback automático
- `DAILY_COST_CAP_USD` — opcional (default: "10")
- `CRON_SECRET` — token de 32+ chars para autenticar `POST /api/cron/evidences` via GitHub Actions; deve ser configurado tanto aqui (Replit env var) quanto no repositório GitHub (`Settings → Secrets → Actions`) como `CRON_SECRET`. O segundo secret GitHub `APP_URL` também é necessário para o workflow disparar a URL correta.

## Sistema de evidências hierárquicas

Infraestrutura de coleta automática de dados de meta (top 8, listas públicas, etc.) para enriquecer análises de deck com evidências reais.

### Schema (lib/db/src/schema/)
- `meta_archetype_evidences` — evidências por arquétipo/fonte com suporte a verificação manual e índice único (source_id, event_label, archetype_id)
- `pipeline_health` — log de execuções de pipeline (status ok/broken/import_error, contagem de itens, mensagens de falha)

### Pipelines (artifacts/decksensei/lib/evidence/)
- `types.ts` — interfaces `EvidencePipeline`, `PipelineRun`, `FingerprintCheck`
- `runner.ts` — orquestrador: valida fingerprint → importa → persiste saúde no DB → alerta admin em caso de falha
- `alert.ts` — email de alerta via Resend para ADMIN_EMAIL usando o template emailShell
- `score.ts` — `computeArchetypeConfidence()`: decay temporal (0-30d: 1.0, 30-180d: linear 0.5, 180-365d: linear 0.3, >365d: 0.3) × multiplicador de verificação (verified: 1.0, unverified: 0.6) × sample adequacy
- `upsert.ts` — helper de upsert com ON CONFLICT preservando campos de verificação manual

### Endpoints de cron
- `POST /api/cron/evidences` — entry point semanal, autenticado via `Bearer CRON_SECRET`; lista de pipelines vazia até sessões B-D
- `POST /api/cron/evidences/test/[source]` — executa uma pipeline isolada; autenticado via cookie `admin_session` ou header `x-admin-token`

### GitHub Action
- `.github/workflows/cron-evidences.yml` — dispara toda segunda-feira às 06:00 UTC (03:00 BRT)
- Secrets necessários no GitHub: `APP_URL` e `CRON_SECRET` (mesmo valor da env var no Replit)

## Autenticação admin

- Login em `/admin/login` exige **e-mail** (`ADMIN_EMAIL`) + **senha** (`ADMIN_TOKEN`)
- Cookie `admin_session` = SHA-256 de `"email:token"`
- Header `x-admin-token` também aceito para chamadas diretas de API (token bruto)
- Middleware em `middleware.ts`: valida cookie criptograficamente via Web Crypto API; bloqueia `/admin/*` e `/api/admin/*`, exceto `/admin/login` e `/api/admin/login`
- Validação criptográfica com `timingSafeEqual` em `lib/auth/admin.ts`

## Roteamento

- `/` → redirect 307 para `/digimon`
- `/digimon` → landing + formulário de decklist
- `/digimon/a/[id]` → análise compartilhada (OG tags completas)
- `/digimon/historico` → histórico de análises do usuário logado
- `/obrigado` → pós-captura de email
- `/admin/*` → painel admin protegido
- `POST /api/analyze` → análise de deck (streaming Anthropic)
- `POST /api/analysis/[id]/email` → envia análise por email via Resend
- `GET /api/health` → health check com status do banco e chaves

## Paleta de cores (globals.css)

- `--primary: 234 88% 62%` (blue-violet)
- Background: `hsl(240 30% 5%)` (quase preto azulado)
- Logo: `mix-blend-mode: screen` no fundo escuro

## Comandos principais

```bash
pnpm --filter @workspace/decksensei run dev    # dev server
pnpm --filter @workspace/db run push             # aplicar schema no banco
npx tsc --noEmit                                  # type check (zero erros)
```

## Arquitetura TCG-agnóstica (refactor completo)

**Princípio:** cadastrar um jogo novo = preencher formulário no `/admin/games/new`. Zero código novo.

`games.config` (JSONB) agora tem três blocos além dos existentes:

```json
{
  "parser":    { "line_patterns": [...], "groups": {...}, "section_markers": {...}, "comment_prefixes": [...] },
  "card_api":  { "url_template": "...", "response_path": "$[0]", "field_mapping": {...}, "rate_limit": {...} },
  "validator": { "main_deck_size": {"min":50,"max":50}, "aux_decks": {...}, "max_copies_per_card": 4 }
}
```

Adapters genéricos em `lib/games/generic/` implementam `DeckParser`, `CardAPI`, `DeckValidator` lendo esses blocos.
`getParser(config.parser)` / `getCardAPI(config.card_api)` / `getValidator(config.validator)` — sem switch/case, sem hardcode.
A config chega como prop do server component `[game]/page.tsx` → `DeckInput` (sem acesso a DB no cliente).
`lib/games/digimon/` foi **deletada** — tudo dirigido por dados.

## Mudanças recentes

- **9 melhorias implementadas de uma vez:**
  - **T001 localStorage:** análise salva em `ds_analysis_{gameId}` (24h); restaura automaticamente no mount
  - **T002 Email via Resend:** botão "Enviar por email" pós-análise → form inline → `POST /api/analysis/[id]/email`; rate-limit 1/hora por (id+email); template HTML escuro
  - **T003 Anon limit por IP no DB:** substituiu cookie-check por `checkRateLimit('anon_first:{ip}', 365d, 1)`; resistente a limpeza de cookie; fallback para cookie se DB falhar
  - **T004 PostHog:** `posthog-js` instalado; `lib/posthog-client.ts` + `PostHogInit` no layout; `trackEvent("analysis_format_fallback")` e `trackEvent("suggestions_json_error")` nos pontos de falha; ativa com `NEXT_PUBLIC_POSTHOG_KEY`
  - **T005 Error boundary:** `AnalysisErrorBoundary` (class component) envolve `AnalysisResult`; fallback mostra markdown puro sem quebrar a página
  - **T006 OG tags:** já existia — `generateMetadata` completo em `/[game]/a/[id]/page.tsx`
  - **T007 Concurrency limit:** worker pool de 5 workers máx no enrichment (antes ilimitado); evita burst de conexões em decks grandes
  - **T008 Histórico:** `/[game]/historico` — server component; lista 20 últimas análises do usuário logado com excerpt + data + link
  - **T009 Script de regressão:** `scripts/validate-analyses.ts` — valida formato dos headers e JSON de sugestões nas análises recentes do DB; `scripts/fixtures/digimon-bt21.txt` — deck de fixture
- **Refactor estrutural TCG-agnóstico:** deletada `lib/games/digimon/`, criados adapters genéricos, CRUD `/admin/games`
- Middleware: `/api/admin/login` excluído da proteção (antes bloqueava login)
- Cache da featured analysis via `unstable_cache` (revalidate: 300s, tag `featured-analysis`)

> Histórico completo em `CHANGELOG.md` na raiz do repositório.
