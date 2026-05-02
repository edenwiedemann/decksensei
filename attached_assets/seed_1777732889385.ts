/**
 * Seed inicial do TopdeckCoach.
 *
 * Lê os ativos preparados antes do dia D e popula as tabelas:
 *   - games (row 'digimon')
 *   - prompts (v1 ativa para 'digimon')
 *   - meta_snapshots (snapshot global ativa + snapshot Recife vazia inativa)
 *
 * Idempotente: pode rodar mais de uma vez sem duplicar.
 *
 * COMO RODAR (no shell do Replit):
 *   1. npm install postgres dotenv tsx
 *   2. npx tsx seed/seed.ts
 *
 * Pré-requisito: DATABASE_URL definido em Secrets do Replit (já vem se você
 * habilitou o Postgres do Replit).
 *
 * Pré-requisito: as tabelas games, prompts, meta_snapshots já criadas pelo
 * Replit Agent na execução do prompt H1.1 (schema TCG-agnóstico).
 *
 * Pré-requisito: arquivos de dados nas posições corretas:
 *   - lib/data/meta-archetypes.json
 *   - lib/prompts/digimon-v1.md
 *
 * Os caminhos são relativos à raiz do projeto. Se você manteve o seed.ts em
 * /seed, o script já resolve relativo a __dirname.
 */

import 'dotenv/config'
import postgres from 'postgres'
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

// ───────────────────────────── helpers ─────────────────────────────

const ROOT = resolve(__dirname, '..')
const META_PATH = join(ROOT, 'lib', 'data', 'meta-archetypes.json')
const PROMPT_PATH = join(ROOT, 'lib', 'prompts', 'digimon-v1.md')

function readJsonOrDie(path: string): any {
  if (!existsSync(path)) {
    console.error(`✗ Arquivo não encontrado: ${path}`)
    console.error(`  Coloque o meta-archetypes.json em lib/data/ antes de rodar o seed.`)
    process.exit(1)
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error(`✗ JSON inválido em: ${path}`)
    console.error(`  ${(e as Error).message}`)
    process.exit(1)
  }
}

function readTextOrDie(path: string): string {
  if (!existsSync(path)) {
    console.error(`✗ Arquivo não encontrado: ${path}`)
    console.error(`  Coloque o digimon-v1.md em lib/prompts/ antes de rodar o seed.`)
    process.exit(1)
  }
  return readFileSync(path, 'utf8')
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`✗ Variável de ambiente faltando: ${name}`)
    console.error(`  Configure no Replit Secrets antes de rodar o seed.`)
    process.exit(1)
  }
  return v
}

// ───────────────────────────── main ─────────────────────────────

async function seed() {
  console.log('🌱 TopdeckCoach seed iniciando...\n')

  const databaseUrl = requireEnv('DATABASE_URL')
  const sql = postgres(databaseUrl, { max: 1 })

  try {
    const metaJson = readJsonOrDie(META_PATH)
    const promptContent = readTextOrDie(PROMPT_PATH)

    // ─── 1. Upsert game 'digimon' ───────────────────────────────
    await sql`
      INSERT INTO games (id, name, config, created_at)
      VALUES (
        'digimon',
        ${metaJson.game.name},
        ${sql.json(metaJson.game)},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        config = EXCLUDED.config
    `
    console.log(`✓ Game 'digimon' upserted (${metaJson.game.name})`)

    // ─── 2. Insert prompt v1 (only if no prompt exists for digimon) ─
    const existingPromptCount = await sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM prompts WHERE game_id = 'digimon'
    `
    if (existingPromptCount[0].count === '0') {
      await sql`UPDATE prompts SET active = false WHERE game_id = 'digimon'`
      await sql`
        INSERT INTO prompts (game_id, version, system_content, notes, active, created_at)
        VALUES (
          'digimon',
          'v1',
          ${promptContent},
          'Versão inicial gerada no seed do dia D. Conteúdo extraído do system-prompt.md preparado pelo Claude.',
          true,
          NOW()
        )
      `
      console.log(`✓ Prompt 'digimon v1' inserido como ativo (${promptContent.length} chars)`)
    } else {
      console.log(`⊘ Prompts pra 'digimon' já existem — seed pula inserção. Use /admin/prompts pra criar nova versão.`)
    }

    // ─── 3. Insert meta snapshot global ─────────────────────────
    const snapshotVersion = `BT21-${metaJson.snapshot.fetched_at}`
    const existingGlobal = await sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM meta_snapshots
      WHERE game_id = 'digimon' AND scope = 'global' AND version = ${snapshotVersion}
    `
    if (existingGlobal[0].count === '0') {
      await sql`
        UPDATE meta_snapshots SET active = false
        WHERE game_id = 'digimon' AND scope = 'global'
      `
      await sql`
        INSERT INTO meta_snapshots (game_id, version, json_content, notes, scope, active, created_at)
        VALUES (
          'digimon',
          ${snapshotVersion},
          ${sql.json(metaJson)},
          ${`Snapshot inicial puxada do Limitless TCG BT21 Standard em ${metaJson.snapshot.fetched_at}. ${metaJson.archetypes.length} arquetipos.`},
          'global',
          true,
          NOW()
        )
      `
      console.log(`✓ Snapshot 'digimon ${snapshotVersion}' inserida como ativa (global, ${metaJson.archetypes.length} arquetipos)`)
    } else {
      console.log(`⊘ Snapshot ${snapshotVersion} já existe — seed pula inserção.`)
    }

    // ─── 4. Insert empty meta-Recife snapshot (inactive) ────────
    const existingRecife = await sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM meta_snapshots
      WHERE game_id = 'digimon' AND scope = 'local'
    `
    if (existingRecife[0].count === '0') {
      const emptyRecife = {
        $schema_version: metaJson.$schema_version,
        game: metaJson.game,
        format: 'BT21 Standard (EN) — META LOCAL RECIFE',
        snapshot: {
          fetched_at: metaJson.snapshot.fetched_at,
          primary_source: 'manual — preenchido pelo curador da cena Recife via /admin/meta-recife',
          notes_pt: 'Snapshot vazia inicial. Preencher com 3-5 arquetipos efetivamente jogados na cena Recife/PE pelo painel admin visual.'
        },
        tier_legend_pt: metaJson.tier_legend_pt,
        archetypes: []
      }
      await sql`
        INSERT INTO meta_snapshots (game_id, version, json_content, notes, scope, active, created_at)
        VALUES (
          'digimon',
          'recife-v1',
          ${sql.json(emptyRecife)},
          'Snapshot vazia da cena Recife — preencher via /admin/meta-recife antes de ativar.',
          'local',
          false,
          NOW()
        )
      `
      console.log(`✓ Snapshot 'digimon recife-v1' inserida como inativa (vazia, pronta pra preencher)`)
    } else {
      console.log(`⊘ Snapshot Recife já existe — seed pula inserção.`)
    }

    console.log('\n🌱 Seed completo. Verifica:')
    console.log('   - /admin/prompts deve listar v1 ativa')
    console.log('   - /admin/meta deve listar BT21-' + metaJson.snapshot.fetched_at + ' ativa')
    console.log('   - /admin/meta-recife deve listar recife-v1 inativa (pra preencher)\n')
  } catch (err) {
    console.error('\n✗ Seed falhou:')
    console.error(err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

seed()
