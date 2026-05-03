#!/usr/bin/env node
/**
 * scripts/validate-analyses.ts
 *
 * Valida o formato das análises recentes no banco de dados.
 * Útil para detectar regressões no formato da resposta do Claude
 * após edições no prompt.
 *
 * Uso:
 *   npx tsx scripts/validate-analyses.ts [--gameId=digimon] [--limit=50]
 *
 * Variáveis de ambiente necessárias:
 *   DATABASE_URL
 */

import pg from "pg";

const { Pool } = pg;

const EXPECTED_HEADERS = [
  "## Visão geral",
  "## Plano de jogo",
  "## Pontos fortes",
  "## Vulnerabilidades",
  "## Comparação com o meta",
  "## Sugestões de troca",
];

const SUGGESTIONS_RE = /```sugestoes\s*([\s\S]*?)```/;

interface AnalysisRow {
  id: string;
  game_id: string;
  analysis_text: string;
  created_at: Date;
}

interface ValidationResult {
  id: string;
  gameId: string;
  createdAt: Date;
  pass: boolean;
  missingHeaders: string[];
  suggestionsOk: boolean | null;
  suggestionsError?: string;
}

function parseArgs(): { gameId: string; limit: number } {
  const args = process.argv.slice(2);
  let gameId = "digimon";
  let limit = 50;
  for (const arg of args) {
    if (arg.startsWith("--gameId=")) gameId = arg.slice(9);
    if (arg.startsWith("--limit=")) limit = parseInt(arg.slice(8), 10);
  }
  return { gameId, limit };
}

function validateAnalysis(text: string): Omit<ValidationResult, "id" | "gameId" | "createdAt"> {
  const missingHeaders = EXPECTED_HEADERS.filter((h) => !text.includes(h));
  const pass = missingHeaders.length === 0;

  const match = text.match(SUGGESTIONS_RE);
  let suggestionsOk: boolean | null = null;
  let suggestionsError: string | undefined;

  if (match) {
    try {
      const parsed: unknown = JSON.parse(match[1].trim());
      suggestionsOk = Array.isArray(parsed) && parsed.length > 0;
      if (!suggestionsOk) suggestionsError = "array vazio ou não-array";
    } catch (e) {
      suggestionsOk = false;
      suggestionsError = String(e);
    }
  }

  return { pass, missingHeaders, suggestionsOk, suggestionsError };
}

async function main() {
  const { gameId, limit } = parseArgs();

  if (!process.env.DATABASE_URL) {
    console.error("❌  DATABASE_URL não definida.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`\nDeck Sensei — Validação de análises`);
  console.log(`Jogo: ${gameId}  |  Limite: ${limit}\n`);

  let rows: AnalysisRow[];
  try {
    const result = await pool.query<AnalysisRow>(
      `SELECT id, game_id, analysis_text, created_at
       FROM analyses
       WHERE game_id = $1
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [gameId, limit],
    );
    rows = result.rows;
  } finally {
    await pool.end();
  }

  if (rows.length === 0) {
    console.log("Nenhuma análise encontrada.");
    return;
  }

  const results: ValidationResult[] = rows.map((row) => ({
    id: row.id,
    gameId: row.game_id,
    createdAt: row.created_at,
    ...validateAnalysis(row.analysis_text),
  }));

  const passed = results.filter((r) => r.pass);
  const failed = results.filter((r) => !r.pass);
  const suggestionsTotal = results.filter((r) => r.suggestionsOk !== null);
  const suggestionsOkCount = suggestionsTotal.filter((r) => r.suggestionsOk).length;

  // ─── Falhos ──────────────────────────────────────────────────────────────
  if (failed.length > 0) {
    console.log(`⚠️  Análises com formato inesperado (${failed.length}/${results.length}):\n`);
    for (const r of failed) {
      const date = r.createdAt.toLocaleDateString("pt-BR");
      console.log(`  ✗  ${r.id}  (${date})`);
      for (const h of r.missingHeaders) {
        console.log(`       header ausente: "${h}"`);
      }
    }
    console.log();
  }

  // ─── Sugestões ───────────────────────────────────────────────────────────
  const suggestionsErrors = suggestionsTotal.filter((r) => !r.suggestionsOk);
  if (suggestionsErrors.length > 0) {
    console.log(`⚠️  JSON de sugestões inválido (${suggestionsErrors.length}):\n`);
    for (const r of suggestionsErrors) {
      console.log(`  ✗  ${r.id}: ${r.suggestionsError ?? "erro desconhecido"}`);
    }
    console.log();
  }

  // ─── Resumo ───────────────────────────────────────────────────────────────
  console.log("─── Resumo ───────────────────────────────────────────");
  console.log(`  Analisadas:       ${results.length}`);
  console.log(`  Formato OK:       ${passed.length}/${results.length}  (${pct(passed.length, results.length)}%)`);
  if (suggestionsTotal.length > 0) {
    console.log(
      `  Sugestões JSON OK: ${suggestionsOkCount}/${suggestionsTotal.length}  (${pct(suggestionsOkCount, suggestionsTotal.length)}%)`,
    );
  }
  console.log();

  if (failed.length > 0 || suggestionsErrors.length > 0) {
    console.log("👉  Considere ajustar o prompt para ser mais estrito sobre o formato.\n");
    process.exit(1);
  } else {
    console.log("✅  Todas as análises estão no formato esperado.\n");
  }
}

function pct(n: number, total: number): string {
  return total === 0 ? "0" : Math.round((n / total) * 100).toString();
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
