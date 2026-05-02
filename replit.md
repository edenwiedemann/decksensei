# Deck Sensei

## Visão geral

Web app de análise estratégica de decks de TCG por IA, em português brasileiro.
Projeto pai-e-filho: pai cuida da parte técnica, filho (jogador competitivo de Digimon em Recife/PE) é a voz pública.

**Jogo atual:** Digimon Card Game (BT21 Standard EN).
**Arquitetura:** TCG-agnóstica — o jogo é sempre parâmetro de URL/schema, nunca hardcode.

## Stack

- **Framework:** Next.js 15 + App Router + TypeScript strict mode
- **Estilo:** Tailwind CSS v4 + shadcn/ui
- **Banco:** PostgreSQL (Replit) + Drizzle ORM
- **IA:** Anthropic SDK (`@anthropic-ai/sdk`) — motor de análise via streaming
- **Email:** Resend — magic link login
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
        card-search/route.ts
        featured/set/route.ts
        meta/snapshots/     ← CRUD de snapshots e arquétipos
        prompts/            ← CRUD de prompts
        users/export/route.ts
    layout.tsx
    globals.css
  lib/
    env.ts                  ← validação de env vars no boot
    auth/admin.ts           ← requireAdmin, requireAdminCookie, adminSessionValue
    games/
      types.ts              ← interfaces TCG-agnósticas
      digimon/              ← adapters do Digimon
    game-config.ts
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

## Autenticação admin

- Login em `/admin/login` exige **e-mail** (`ADMIN_EMAIL`) + **senha** (`ADMIN_TOKEN`)
- Cookie `admin_session` = SHA-256 de `"email:token"`
- Header `x-admin-token` também aceito para chamadas diretas de API (token bruto)
- Middleware em `middleware.ts`: valida cookie criptograficamente via Web Crypto API; bloqueia `/admin/*` e `/api/admin/*`, exceto `/admin/login` e `/api/admin/login`
- Validação criptográfica com `timingSafeEqual` em `lib/auth/admin.ts`

## Roteamento

- `/` → redirect 307 para `/digimon`
- `/digimon` → landing + formulário de decklist
- `/digimon/a/[id]` → análise compartilhada
- `/obrigado` → pós-captura de email
- `/admin/*` → painel admin protegido
- `POST /api/analyze` → análise de deck (streaming Anthropic)
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

## Histórico de bugs corrigidos

- Diretório `src/` (scaffold Vite morto) removido — conflitava com App Router
- `.next` cache limpo após remoção do `src/`
- `env.ts` usa `REPLIT_DOMAINS` como fallback para `APP_URL`
- `lib/game-config.ts`: `DeckRules` re-exportado corretamente com import local
- `app/admin/feedback/page.tsx`: coluna `deck_text` (não `decklist_raw`)
- Middleware: `/api/admin/login` excluído da proteção (antes bloqueava login)
- `app/api/admin/analyses/recent/route.ts`: removido JOIN em `meta_archetypes` (tabela inexistente)
- `env.ts`: banner de erro renomeado de "TopdeckCoach" para "Deck Sensei"
- `app/layout.tsx`: adicionado `icons.icon` para favicon.svg (resolve 404 de favicon.ico)
