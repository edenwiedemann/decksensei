/**
 * Funções de scraping para play.limitlesstcg.com (jogo DCG — Digimon Card Game).
 *
 * Todas as funções usam AbortSignal.timeout(10000) e tratam erros de formato
 * silenciosamente (retornam [] ou null — nunca lançam exceção de parse).
 *
 * Estrutura real do site (verificada em 2025-05):
 *  - Listagem: <tr data-share="0.082" data-winrate="0.539">
 *      slug no href /decks/{slug}?game=DCG
 *      record no texto da célula: "275 - 177 - 58"
 *  - Matchups: <tr data-name="Sakuyamon" data-winrate="0.531">
 *  - Decklist: const decklist = `4 BT21-... \n ...`
 */

const BASE = "https://play.limitlesstcg.com";
const BOT_HEADERS = {
  "User-Agent": "DeckSensei-Bot/1.0 (https://decksensei.com.br)",
  Accept: "text/html,application/xhtml+xml",
};

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface LimitlessArchetype {
  name: string;
  slug: string;
  decks_count: number;
  share_pct: number;
  wins: number;
  losses: number;
  ties: number;
  win_rate_pct: number;
}

export interface LimitlessMatchup {
  vs: string;
  win_rate_pct: number;
}

export interface LimitlessDecklist {
  source: string;
  main: string[];
  egg: string[];
}

// ─── Helpers internos ────────────────────────────────────────────────────────

/** Remove tags HTML de uma string. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Lê atributo de uma tag HTML. */
function attr(html: string, name: string): string | null {
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  return html.match(re)?.[1] ?? null;
}

// ─── fetchArchetypeList ───────────────────────────────────────────────────────

/**
 * Busca a página de listagem de arquetipos do Limitless para o formato dado.
 *
 * Cada linha `<tr>` tem atributos:
 *   data-share="0.082"    (fração, não percentual)
 *   data-winrate="0.539"  (fração)
 *
 * O nome do arquetipo vem do texto do link e o slug vem do href.
 * O record (W-L-T) vem de uma célula com texto "275 - 177 - 58".
 * A contagem de decks vem de uma `<td class="landscape-only">`.
 */
export async function fetchArchetypeList(format: string): Promise<LimitlessArchetype[]> {
  const url = `${BASE}/decks?game=DCG&format=standard&set=${encodeURIComponent(format)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: BOT_HEADERS,
  });
  if (!res.ok) throw new Error(`Limitless list returned ${res.status}`);
  const html = await res.text();

  const archetypes: LimitlessArchetype[] = [];

  // Extrai cada <tr data-share=... data-winrate=...>
  const rowRe = /<tr\s[^>]*data-share="([^"]+)"[^>]*data-winrate="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const shareFrac = parseFloat(rowMatch[1]);
    const winrateFrac = parseFloat(rowMatch[2]);
    const rowContent = rowMatch[3];

    // Slug e nome do deck: href="/decks/{slug}?game=DCG..."
    const linkMatch = rowContent.match(/href="\/decks\/([^"?]+)\?[^"]*game=DCG[^"]*"[^>]*>([^<]+)<\/a>/i);
    if (!linkMatch) continue;

    // O slug pode ter espaços e outros caracteres — decodificamos o href
    const slug = decodeURIComponent(linkMatch[1]);
    const name = linkMatch[2].trim();

    // Ignora a linha "Other" (arquetipo artificial)
    if (slug === "other" || name.toLowerCase() === "other") continue;

    // Contagem de decks: primeira <td class="landscape-only"> com inteiro puro
    const countMatch = rowContent.match(/<td[^>]*class="landscape-only"[^>]*>(\d+)<\/td>/i);
    const deckCount = countMatch ? parseInt(countMatch[1], 10) : 0;

    // Record W - L - T: padrão "275 - 177 - 58" numa célula qualquer
    const recordMatch = rowContent.match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
    let wins = 0, losses = 0, ties = 0;
    if (recordMatch) {
      wins   = parseInt(recordMatch[1], 10);
      losses = parseInt(recordMatch[2], 10);
      ties   = parseInt(recordMatch[3], 10);
    }

    const share_pct    = Math.round(shareFrac * 10_000) / 100;
    const win_rate_pct = Math.round(winrateFrac * 10_000) / 100;

    archetypes.push({ name, slug, decks_count: deckCount, share_pct, wins, losses, ties, win_rate_pct });
  }

  return archetypes;
}

// ─── fetchMatchups ────────────────────────────────────────────────────────────

/**
 * Busca a página de matchups de um arquetipo no Limitless.
 *
 * Cada linha `<tr>` tem:
 *   data-name="Sakuyamon"
 *   data-winrate="0.531"  (fração)
 */
export async function fetchMatchups(slug: string, format: string): Promise<LimitlessMatchup[]> {
  const url = `${BASE}/decks/${encodeURIComponent(slug)}/matchups?game=DCG&format=standard&set=${encodeURIComponent(format)}`;
  let html: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: BOT_HEADERS,
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  const matchups: LimitlessMatchup[] = [];

  const rowRe = /<tr\s[^>]*data-name="([^"]+)"[^>]*data-winrate="([^"]+)"[^>]*>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const vsName = decodeURIComponent(rowMatch[1].trim());
    const winrateFrac = parseFloat(rowMatch[2]);
    if (!vsName || isNaN(winrateFrac)) continue;
    matchups.push({ vs: vsName, win_rate_pct: Math.round(winrateFrac * 10_000) / 100 });
  }

  return matchups;
}

// ─── fetchTopDecklist ─────────────────────────────────────────────────────────

/**
 * Busca a primeira decklist listada para um arquetipo no Limitless.
 * 1. Acessa a página do arquetipo e pega o 1º link de decklist.
 * 2. Acessa a página da decklist e parseia o bloco `const decklist = \`...\``.
 */
export async function fetchTopDecklist(slug: string, format: string): Promise<LimitlessDecklist | null> {
  const archetypeUrl = `${BASE}/decks/${encodeURIComponent(slug)}?game=DCG&format=standard&set=${encodeURIComponent(format)}`;
  let archetypeHtml: string;
  try {
    const res = await fetch(archetypeUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: BOT_HEADERS,
    });
    if (!res.ok) return null;
    archetypeHtml = await res.text();
  } catch {
    return null;
  }

  // Procura link pra decklist individual: /tournament/{id}/player/{name}/decklist
  const declistLinkMatch = archetypeHtml.match(
    /href="(\/tournament\/[a-f0-9]+\/player\/[^"']+\/decklist)"/i,
  );
  if (!declistLinkMatch) return null;

  const declistPath = declistLinkMatch[1];

  // Tenta extrair player name da URL
  const playerNameMatch = declistPath.match(/\/player\/([^/]+)\/decklist/);
  const playerName = playerNameMatch ? decodeURIComponent(playerNameMatch[1]) : "unknown";

  let declistHtml: string;
  try {
    const res = await fetch(`${BASE}${declistPath}`, {
      signal: AbortSignal.timeout(10_000),
      headers: BOT_HEADERS,
    });
    if (!res.ok) return null;
    declistHtml = await res.text();
  } catch {
    return null;
  }

  // Parseia o bloco: const decklist = `...`
  const decklistMatch = declistHtml.match(/const decklist\s*=\s*`([\s\S]*?)`/);
  if (!decklistMatch) return null;

  const rawDecklist = decklistMatch[1].trim();
  const lines = rawDecklist.split("\n").map((l) => l.trim()).filter(Boolean);

  const main: string[] = [];
  const egg: string[] = [];
  let inEgg = false;

  for (const line of lines) {
    if (/^egg\s*deck\s*:?$/i.test(line)) { inEgg = true; continue; }
    // Linha de carta: "4 Magnamon BT13-040" ou "4 King Drasil_7D6 BT13-007"
    // Formato Limitless: quantidade + nome + código (código no fim da linha)
    if (/^\d+\s+.+\s+[A-Z]{1,5}\d{1,2}-\d+$/.test(line)) {
      if (inEgg) egg.push(line);
      else main.push(line);
    }
  }

  if (main.length === 0) return null;

  return { source: playerName, main, egg };
}

// ─── verifyMagicString ────────────────────────────────────────────────────────

/**
 * Verifica se a string mágica do parser de decklists ainda existe.
 * Usado pelo fingerprint check.
 */
export async function verifyMagicString(declistPath: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}${declistPath}`, {
      signal: AbortSignal.timeout(10_000),
      headers: BOT_HEADERS,
    });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes("const decklist = `");
  } catch {
    return false;
  }
}

// re-export for use in index.ts fingerprint check
export { attr, stripTags };
