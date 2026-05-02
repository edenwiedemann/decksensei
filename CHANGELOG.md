# CHANGELOG

Histórico de correções e mudanças relevantes no projeto.

## Bugs corrigidos

- Diretório `src/` (scaffold Vite morto) removido — conflitava com App Router
- `.next` cache limpo após remoção do `src/`
- `env.ts` usa `REPLIT_DOMAINS` como fallback para `APP_URL`
- `lib/game-config.ts`: `DeckRules` re-exportado corretamente com import local
- `app/admin/feedback/page.tsx`: coluna `deck_text` (não `decklist_raw`)
- Middleware: `/api/admin/login` excluído da proteção (antes bloqueava login)
- `app/api/admin/analyses/recent/route.ts`: removido JOIN em `meta_archetypes` (tabela inexistente)
- `env.ts`: banner de erro renomeado de "TopdeckCoach" para "Deck Sensei"
- `app/layout.tsx`: adicionado `icons.icon` para favicon.svg (resolve 404 de favicon.ico)

## Mudanças de arquitetura

- Artifact renomeado de `topdeckcoach` → `decksensei` (pasta + package name); ID interno do artifact permanece `artifacts/topdeckcoach` (imutável pelo sistema)
- `admin_note` restrito a soft-delete; `featured_player_name varchar(100)` adicionado como coluna dedicada em `analyses`
- Rate limit migrado de in-memory para Postgres (`rate_limits` table)
- `ADMIN_TOKEN` mínimo elevado de 8 para 32 caracteres
- `getDailyCost()` migrado de UTC para `America/Sao_Paulo`
- Cache da `featured analysis` via `unstable_cache` (revalidate: 300s + tag `featured-analysis`)
