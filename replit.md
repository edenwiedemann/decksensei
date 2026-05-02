# TopdeckCoach

## Visão geral

Web app de análise estratégica de decks de TCG por IA, em português brasileiro.
Projeto pai-e-filho: pai cuida da parte técnica, filho (jogador competitivo de Digimon em Recife/PE) é a voz pública.

**Jogo atual:** Digimon Card Game (BT21 Standard EN).
**Arquitetura:** TCG-agnóstica — o jogo é sempre parâmetro de URL/schema, nunca hardcode.

## Stack

- **Framework:** Next.js 15 + App Router + TypeScript strict mode
- **Estilo:** Tailwind CSS v4 + shadcn/ui
- **Banco:** PostgreSQL (Replit) + Drizzle ORM
- **IA:** Anthropic SDK (`@anthropic-ai/sdk`) — motor de análise
- **Email:** Resend — magic link login
- **Monorepo:** pnpm workspaces

## Estrutura de pastas (artifact: topdeckcoach)

```
artifacts/topdeckcoach/
  app/                  ← Next.js App Router
    [game]/page.tsx     ← página por jogo (ex: /digimon)
    layout.tsx
    page.tsx            ← redireciona / → /digimon
    globals.css
  lib/
    env.ts              ← validação de variáveis de ambiente no boot
    games/
      types.ts          ← interfaces TCG-agnósticas (CardAPI, DeckParser, DeckValidator)
      digimon/          ← adapters específicos do Digimon (Épico 2)
        card-api.ts
        deck-parser.ts
        deck-validator.ts
  components/           ← componentes shadcn/ui (a popular nos épicos seguintes)
```

## Schema do banco (lib/db/src/schema/)

Tabelas TCG-agnósticas — todas com `game_id`:

- `games` — jogos suportados
- `users` + `magic_tokens` + `sessions` — autenticação por magic link
- `meta_snapshots` — snapshots do meta por jogo/escopo (global ou local)
- `prompts` — system prompts versionados por jogo
- `analyses` — análises geradas (ID nanoid público)
- `analysis_feedback` — upvote/downvote de análises
- `api_costs` — registro de custo por chamada Anthropic
- `rate_limits` — controle de rate limit por chave

## Variáveis de ambiente obrigatórias

Ver `.env.example`. Secrets já configuradas no Replit:
- `DATABASE_URL` — auto-injetada pelo Postgres do Replit
- `ANTHROPIC_API_KEY` — necessária no Épico 3
- `RESEND_API_KEY` — necessária no Épico 5
- `ADMIN_TOKEN` — necessária no Épico 6
- `APP_URL` — URL pública da aplicação
- `DAILY_COST_CAP_USD` — limite diário de gasto na Anthropic (default: "10")

## Roteamento

- `/` → redirect 307 para `/digimon`
- `/digimon` → landing (Épico 4)
- `/digimon/a/[id]` → análise compartilhada (Épico 4)
- `/admin/*` → painel admin (Épico 6)
- `/sobre`, `/auth/verify` → páginas globais (Épicos 4–5)

## Comandos principais

- `pnpm --filter @workspace/topdeckcoach run dev` — rodar app em dev
- `pnpm --filter @workspace/db run push` — aplicar schema no banco
- `pnpm --filter @workspace/api-spec run codegen` — codegen de hooks (se necessário)

## Fluxo de prompts

Os prompts chegam em sequência numerada (H1.1, H1.2, ...). Cada história é uma unidade de demo verificável.
