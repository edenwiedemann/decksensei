/**
 * Seed: adiciona evidence_sources e archetype_aliases ao games.config do jogo 'digimon'.
 *
 * Uso:
 *   pnpm --filter @workspace/db exec tsx ../../scripts/seed-digimon-evidence-config.ts
 *   ou:
 *   npx tsx scripts/seed-digimon-evidence-config.ts
 */

import { pool } from "../lib/db/src/index";

const EVIDENCE_SOURCES = [
  {
    id: "bandai-worlds-final",
    label: "Bandai — World Championship Final",
    weight: 100,
    type: "publisher_official",
    auto_verified: true,
    url_pattern: "world.digimoncard.com/report/.*world.*final.*",
  },
  {
    id: "bandai-regionals",
    label: "Bandai — Regionals",
    weight: 90,
    type: "publisher_official",
    auto_verified: true,
    url_pattern: "world.digimoncard.com/report/.*regional.*",
  },
  {
    id: "bandai-ultimate-cup",
    label: "Bandai — Ultimate Cup",
    weight: 85,
    type: "publisher_official",
    auto_verified: true,
    url_pattern: "world.digimoncard.com/report/.*ultimate.*cup.*",
  },
  {
    id: "bandai-store-championship",
    label: "Bandai — Store Championship",
    weight: 75,
    type: "publisher_official",
    auto_verified: true,
    url_pattern: "world.digimoncard.com/report/.*store.*cs.*",
  },
  {
    id: "digimonmeta-review",
    label: "DigimonMeta.com (review editorial)",
    weight: 70,
    type: "editorial_curated",
    auto_verified: true,
  },
  {
    id: "limitless-tcg",
    label: "Limitless TCG (agregador)",
    weight: 50,
    type: "aggregator_with_proof",
    auto_verified: false,
    min_sample_size: 100,
  },
  {
    id: "digimoncard-io",
    label: "DigimonCard.io (self-reported)",
    weight: 25,
    type: "self_reported",
    auto_verified: false,
    min_sample_size: 200,
  },
  {
    id: "local-meta-recife",
    label: "Meta local Recife",
    weight: 30,
    weight_local_override: 95,
    type: "local_curated",
    auto_verified: false,
  },
];

const ARCHETYPE_ALIASES: Record<string, string[]> = {
  royal_knights: ["Royal Knights", "ロイヤルナイツ", "RK"],
  sakuyamon: ["Sakuyamon", "サクヤモン"],
  blue_green_imperialdramon: [
    "Blue Green Imperialdramon",
    "BG Imperial",
    "Imperialdramon Azul/Verde",
  ],
  purple_hybrid: ["Purple Hybrid", "Híbridos Roxos"],
  megidramon: ["Megidramon", "メギドラモン"],
  vemmon: ["Vemmon", "ヴェムモン"],
  red_phoenixmon: ["Red Phoenixmon", "Phoenixmon"],
  adventure: ["Adventure", "Tai and core card"],
  hudiemon: ["Hudiemon", "フーディエモン"],
  ts_jupitermon: ["TS Jupitermon", "TSユピテルモン"],
  leviamon: ["Leviamon", "リヴァイアモン"],
  medusamon: ["Medusamon", "メデューサモン"],
  ts_iliad: ["TS Iliad", "TSイリアス"],
  cendrillmon: ["Cendrillmon", "サンドリモン"],
  ts_abyss_area: ["TS Abyss Area", "TSアビスエリア"],
  pyramidimon: ["Pyramidimon", "ピラミディモン"],
};

async function main() {
  console.log("Updating games.config for 'digimon'...");

  const patch = {
    evidence_sources: EVIDENCE_SOURCES,
    archetype_aliases: ARCHETYPE_ALIASES,
  };

  const result = await pool.query(
    `UPDATE games
     SET config = config || $1::jsonb
     WHERE id = 'digimon'
     RETURNING id`,
    [JSON.stringify(patch)],
  );

  if (result.rowCount === 0) {
    console.error("Game 'digimon' not found — nothing updated.");
    process.exit(1);
  }

  console.log("✓ evidence_sources and archetype_aliases added to digimon config.");

  // Verificação rápida
  const check = await pool.query<{ config: Record<string, unknown> }>(
    `SELECT config FROM games WHERE id = 'digimon' LIMIT 1`,
  );
  const cfg = check.rows[0]?.config ?? {};
  const sources = cfg["evidence_sources"] as unknown[] | undefined;
  const aliases = cfg["archetype_aliases"] as Record<string, unknown> | undefined;
  console.log(`  evidence_sources: ${sources?.length ?? 0} entries`);
  console.log(`  archetype_aliases: ${Object.keys(aliases ?? {}).length} archetypes`);

  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
