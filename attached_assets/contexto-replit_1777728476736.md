# Contexto do projeto — cole isto no Replit Agent ANTES de qualquer outro prompt

> Este texto estabelece identidade, arquitetura, convenções e fluxo de trabalho do projeto pro Replit Agent. Cole inteiro como primeira mensagem da sessão. Depois disso, vou alimentar prompts em sequência ("Prompt H1.1", "Prompt H1.2", etc).

---

# Briefing pro Replit Agent

Você vai me ajudar a construir um projeto chamado **TopdeckCoach**. Antes de qualquer trabalho, leia este briefing inteiro. Não comece a codar até eu mandar um prompt específico (formato "Prompt H1.1", "Prompt H1.2", etc). Se algo neste briefing parecer ambíguo ou conflitar com um prompt futuro, **me pergunta antes de assumir**.

## O que é o produto

TopdeckCoach é um web app de **análise estratégica de decks de TCG por inteligência artificial, em português brasileiro**. O usuário cola uma decklist, e em ~30 segundos recebe uma análise completa: visão geral, plano de jogo turno a turno, pontos fortes, vulnerabilidades, comparação com o arquetipo mais similar do meta atual, e 3 sugestões de troca de cartas com justificativa baseada em matchups reais.

O primeiro jogo suportado é **Digimon Card Game** (formato BT21 Standard EN). A arquitetura é **TCG-agnóstica desde o dia 1** — vamos estender pra Lorcana, One Piece e Star Wars Unlimited depois. Significa que **não pode haver hardcode de "Digimon" no código** — o jogo é parâmetro de URL e do schema do banco, não constante embutida.

Contexto humano: é projeto de fim de semana de pai-e-filho. Filho é jogador competitivo de Digimon que lidera a cena de Recife/PE. Pai (Eden, eu) cuida da parte técnica. **A voz pública do produto é do filho**. O admin do produto precisa ser operável pelo filho mesmo sem ele saber programar.

## Stack obrigatório

Use exatamente estas tecnologias. Não substitua sem me perguntar.

- **Next.js 14** com App Router e TypeScript (strict mode).
- **Tailwind CSS** + **shadcn/ui** (tema neutro). Sem outras libs de UI ou CSS frameworks.
- **Postgres** do Replit (use a env var `DATABASE_URL` que o Replit injeta automaticamente).
- **Drizzle ORM** pra schema e queries.
- **Anthropic SDK oficial** (`@anthropic-ai/sdk`) pro motor de análise. Use o modelo Claude Sonnet mais recente disponível na conta — confere o model string atual em https://docs.anthropic.com (não use "claude-sonnet-4-7" cegamente — esse model string pode não existir).
- **Resend** (`resend` package) pra magic link de login + email de confirmação. Use a env var `RESEND_API_KEY`.
- **postgres-js** (`postgres` package) pro script de seed standalone.
- Para o admin visual: **@uiw/react-md-editor** (editor de markdown com preview) e **@dnd-kit/core** (drag-and-drop pra reordenar cartas). Confirma comigo antes de instalar dependências adicionais que custam contexto.

## Decisões arquiteturais não-negociáveis

### 1. Roteamento prefixado por jogo

Todas as rotas públicas vivem sob `/[game]/...`:

- `/` → redirect 307 para `/digimon` (jogo padrão atual)
- `/digimon` → landing
- `/digimon/a/[id]` → análise compartilhada (link permalink)
- `/digimon/admin/...` ou `/admin/...` (com seletor de jogo no painel) — decida pelo segundo, mais simples
- `/sobre`, `/obrigado`, `/auth/verify` — não-prefixados (são globais)

### 2. Schema do banco com `game_id` em todas as tabelas relevantes

Estas tabelas TODAS têm coluna `game_id varchar` indexed (ou FK pra `games.id`):

- `games` (id PK varchar, name, config jsonb, created_at)
- `users` (id PK serial, email unique, city nullable, state nullable, created_at, last_seen_at)
- `magic_tokens` (token_hash unique, user_id FK, expires_at, used_at)
- `meta_snapshots` (id PK, game_id, version, json_content jsonb, notes nullable, scope varchar default 'global', active boolean default false, created_at) — índice único parcial garantindo só uma ativa por (game_id, scope)
- `prompts` (id PK, game_id, version, system_content text, notes nullable, active boolean default false, created_at) — índice único parcial garantindo só uma ativa por game_id
- `analyses` (id PK varchar nanoid, game_id, user_id FK nullable, deck_text, deck_parsed jsonb, analysis_text, prompt_version_id FK, meta_snapshot_id FK, similar_archetype_id varchar nullable, response_time_ms int, is_featured boolean default false, deleted_at nullable, admin_note nullable, created_at)
- `analysis_feedback` (id PK, analysis_id FK, rating check in('up','down'), comment nullable, ip varchar, created_at)
- `api_costs` (id PK, analysis_id FK nullable, input_tokens, output_tokens, cost_usd numeric(10,6), is_test boolean default false, created_at)
- `rate_limits` (id PK, key varchar indexed, count int, window_start timestamp)
- `sessions` (id PK varchar, user_id FK, expires_at, created_at) — pra cookies de sessão de usuário logado

### 3. Adapters por jogo em pasta dedicada

Crie estas pastas e interfaces compartilhadas desde o início:

```
/lib/games/
  ├── types.ts           ← interfaces CardAPI, DeckParser, DeckValidator, ParsedCard, EnrichedCard, etc
  └── digimon/
      ├── card-api.ts    ← implementa CardAPI usando digimoncard.io
      ├── deck-parser.ts ← implementa DeckParser pra formato Digimon
      └── deck-validator.ts ← implementa DeckValidator usando regras do games.config
```

Funções de dispatch tipo `getCardAPI(gameId): CardAPI`, `getParser(gameId): DeckParser` despacham por jogo. Por enquanto só Digimon — quando entrar Lorcana, é só adicionar pasta `/lib/games/lorcana/`.

### 4. Sistema de prompt baseado em DB com substituição de variáveis

O system prompt vive em `prompts.system_content` (não em arquivo). A função `buildAnalysisPrompt({ gameId, deck, enrichedCards })` em `/lib/analysis-prompt.ts`:

1. Lê o prompt ativo: `SELECT * FROM prompts WHERE game_id = $1 AND active = true` (cache 60s).
2. Lê snapshot ativa: `SELECT * FROM meta_snapshots WHERE game_id = $1 AND scope = 'global' AND active = true` (cache 60s).
3. Lê snapshot local opcional: `WHERE scope = 'local' AND active = true`.
4. Lê config do jogo: `SELECT * FROM games WHERE id = $1`.
5. Substitui placeholders no `system_content`: `{{game_name}}`, `{{game_card_code_pattern}}`, `{{game_card_code_examples}}`, `{{game_deck_rules}}`, `{{archetypes_context}}`.
6. Retorna `{ system, messages, promptVersionId, metaSnapshotId }` pra registrar qual versão foi usada.

O `{{archetypes_context}}` é texto estruturado (não JSON cru) — formate como prosa por arquetipo: nome, plano, key cards (top 5), matchups bons/ruins, notas.

### 5. Login via email magic link (sem senha)

- Usuário pede magic link → Resend envia email com URL `https://[APP_URL]/auth/verify?token=[uuid]`.
- Token expira em 15 minutos.
- Click no link cria sessão (cookie `session_token` httpOnly + sameSite:strict + secure em prod + maxAge 30 dias).
- Sem logout no MVP. Sem senha. Sem OAuth.
- Primeira análise da sessão é livre. A partir da segunda, modal pede email + cidade/estado opcionais.

### 6. Admin visual operável por não-programador

O admin (rotas `/admin/*`) é o coração da operação contínua do produto. Meu filho vai usar pra atualizar prompts e meta sem tocar em código. **Não pode haver textarea de JSON cru em lugar nenhum**. Tudo é formulário estruturado, dropdown, busca de carta com autocomplete via API, drag-and-drop, validação client-side gentil em PT-BR.

Os dois painéis críticos:
- `/admin/prompts` — editor de prompt com markdown editor + preview side-by-side + painel lateral explicando cada variável `{{...}}` + botão "testar com deck salvo" antes de ativar.
- `/admin/meta` e `/admin/meta-recife` — editor de arquetipos com formulário (nome, tier dropdown, WR, share, cores como chips) + busca de carta com autocomplete (API digimoncard.io) + validação que main deck soma exatamente o tamanho correto.

## Convenções de código

- **TypeScript strict mode**. Sem `any` sem justificativa.
- **Server Components por padrão**. `"use client"` só onde precisa de interatividade (forms, modals).
- **Validação de env vars no boot** via `/lib/env.ts` — se faltar variável obrigatória, app dá erro claro listando todas.
- **Fetch de dados externos sempre em server-side** (não exponha API key Anthropic ao client).
- **Responses de erro do backend sempre em formato consistente**: `{ error: "code_curto", message_pt: "Mensagem amigável em PT-BR" }`. Códigos comuns: `rate_limit`, `daily_cap`, `auth_required`, `validation`.
- **Toda string visível ao usuário em PT-BR**. Mensagens de erro técnicas só em logs do servidor.
- **Mobile-first**. Teste cada componente em viewport 375px antes de considerar pronto.
- **Tom de UX**: coach calmo, direto, sem emojis, sem "boa sorte", sem exclamação demais. Veja referências no system prompt do motor.
- **Imports**: caminhos absolutos com alias `@/` (configura no `tsconfig.json` se ainda não tiver).
- **Streaming de resposta da IA**: usar Server-Sent Events ou Web Streams API do Next.js. Não polling.

## Convenções de schema do banco

- Colunas timestamp sempre com timezone (`timestamp with time zone`).
- IDs serial pra entidades internas (users, leads, feedback). IDs varchar nanoid (8-12 chars) pra entidades públicas (analyses) — porque viram URL pública.
- `created_at timestamp default now()` em toda tabela.
- Soft deletes via `deleted_at timestamp nullable` em vez de DELETE físico, sempre que faz sentido (analyses sim, leads também).
- Índices nas FKs e nas colunas de filtro frequente (game_id, user_id, created_at, email).

## Ativos que vão ser adicionados manualmente

Eu vou subir três arquivos via upload no Replit antes de rodar o seed:

- `/lib/data/meta-archetypes.json` — snapshot inicial do meta Digimon BT21 (32K, 8 arquetipos completos com decklists, win rates, matchups).
- `/lib/prompts/digimon-v1.md` — system prompt v1 com placeholders `{{...}}` (6K).
- `/seed/seed.ts` — script TypeScript que popula tabelas `games`, `prompts` e `meta_snapshots` (uso `postgres-js` direto, não Drizzle, pra ser independente do schema gerado).

**Não tente gerar o conteúdo desses três arquivos** — eles foram preparados separadamente. Quando eu pedir pra rodar o seed, esses arquivos já vão estar no lugar.

## Variáveis de ambiente

App precisa destas Secrets (configuradas no painel do Replit):

- `DATABASE_URL` — auto-injetada pelo Postgres do Replit.
- `ANTHROPIC_API_KEY` — chave da Anthropic.
- `RESEND_API_KEY` — chave da Resend pro envio de magic link.
- `ADMIN_TOKEN` — string aleatória de 32+ caracteres pra autenticar admin.
- `DAILY_COST_CAP_USD` — limite diário de gasto na Anthropic API (string numérica, default "10").
- `APP_URL` — URL pública do app (ex: `https://topdeckcoach.com`).

Tem que ter um helper `/lib/env.ts` que valida todas no boot e exporta tipadas. Boot deve falhar com mensagem clara se faltar alguma.

## Fluxo de trabalho que vou seguir com você

Eu vou colar prompts em sequência, cada um precedido do código tipo "Prompt H1.1", "Prompt H1.2", etc. **Você executa só o prompt enviado. Não adianta trabalho dos próximos.** Cada história é uma unidade de demo verificável — quando termina, eu testo no browser, dou OK, e mando o próximo.

Quando você terminar uma história:
1. Resume o que fez em 2-3 linhas.
2. Lista os arquivos criados/modificados.
3. Indica como eu testo (URL, comando, etc).
4. **Espera meu OK** antes de seguir.

Se um prompt parecer ambíguo, contraditório com este briefing, ou tecnicamente perigoso (ex: schema migration destrutivo), **pergunta antes de executar**. Prefiro perder 30 segundos esclarecendo a ter que reverter 30 minutos depois.

Se você ver duplicação ou simplificação possível entre prompts adjacentes, sugere — mas não execute a sugestão sem meu OK.

## Ordem dos épicos

Vou alimentar nesta ordem (cada um tem várias histórias):

1. **Épico 1** — Fundação (setup + schema TCG-agnóstico).
2. **Épico 2** — Decklist e dados de cartas (parser + validator + API digimoncard.io em /lib/games/digimon/).
3. **Épico 3** — Motor de análise IA (endpoint, builder de prompt com variáveis, streaming).
4. **Épico 4** — Apresentação da análise (UI, share permalink, página /sobre, featured deck).
5. **Épico 5** — Login (email magic link) + captura de dados.
6. **Épico 6** — Funções administrativas (proteções operacionais + admin VISUAL pro filho operar sem programar).

Antes de começar, **confirma que entendeu o briefing** respondendo:
1. Qual é a regra arquitetural número 1 que você não pode quebrar?
2. Em que pasta vão os adapters específicos do jogo Digimon?
3. Quem é o usuário final do admin e qual a implicação de UX disso?
4. O que você faz se um prompt parecer contradizer este briefing?

Depois das suas respostas, eu mando o **Prompt H1.1**.
