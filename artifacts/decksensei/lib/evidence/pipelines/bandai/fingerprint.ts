import type { FingerprintCheck } from "../../types";

const BANDAI_BASE = "https://world.digimoncard.com";
const BOT_HEADERS = { "User-Agent": "DeckSensei-Bot/1.0 (https://decksensei.com.br)" };

export async function validateBandaiFingerprint(): Promise<FingerprintCheck> {
  const failures: string[] = [];

  let html: string;
  try {
    const res = await fetch(`${BANDAI_BASE}/event/`, {
      signal: AbortSignal.timeout(8_000),
      headers: BOT_HEADERS,
    });
    if (!res.ok) {
      failures.push(`Event page returned ${res.status}`);
      return { ok: false, failures };
    }
    html = await res.text();
  } catch (err) {
    failures.push(`Event page fetch failed: ${(err as Error).message}`);
    return { ok: false, failures };
  }

  if (!/<a[^>]+href="\/report\/[^"]+"/.test(html)) {
    failures.push("Nenhum link /report/* encontrado na página de eventos");
    return { ok: false, failures };
  }

  const reportMatch = html.match(/href="(\/report\/[^"]+)"/);
  if (reportMatch?.[1]) {
    try {
      const reportRes = await fetch(`${BANDAI_BASE}${reportMatch[1]}`, {
        signal: AbortSignal.timeout(8_000),
        headers: BOT_HEADERS,
      });
      const reportHtml = await reportRes.text();
      if (!/player\.php|deck\s+recipes\s+of\s+all\s+participants/i.test(reportHtml)) {
        failures.push(
          "Report sample não tem link 'View deck recipes' — formato mudou",
        );
      }
    } catch (err) {
      failures.push(`Report sample fetch failed: ${(err as Error).message}`);
    }
  } else {
    failures.push("Não foi possível pegar report sample pra validar formato");
  }

  return { ok: failures.length === 0, failures };
}
