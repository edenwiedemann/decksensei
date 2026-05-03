/**
 * POST /api/cron/weekly-digest
 *
 * Envia email de resumo semanal ao admin com:
 * - Status de cada pipeline nas últimas 24h
 * - Evidências pendentes de verificação com alta relevância
 *
 * Autenticado via Bearer CRON_SECRET.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

import { env } from "@/lib/env";
import { pool } from "@workspace/db";
import { Resend } from "resend";
import { emailShell, BRAND_FROM } from "@/lib/email-templates";

// ─── Source metadata ──────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; weight: number }> = {
  "bandai-worlds-final":     { label: "Bandai — World Final",        weight: 100 },
  "bandai-regionals":        { label: "Bandai — Regionals",          weight: 90  },
  "bandai-ultimate-cup":     { label: "Bandai — Ultimate Cup",       weight: 85  },
  "bandai-store-championship":{ label: "Bandai — Store Champ.",      weight: 75  },
  "digimonmeta-review":      { label: "DigimonMeta (editorial)",     weight: 70  },
  "limitless-tcg":           { label: "Limitless TCG (agregador)",   weight: 50  },
  "digimoncard-io":          { label: "DigimonCard.io (self-rep.)",  weight: 25  },
};

// ─── Queries ──────────────────────────────────────────────────────────────────

interface PipelineRow {
  source_id: string;
  status: string;
  items_imported: number | null;
  failures: unknown;
  error_message: string | null;
  detected_at: Date;
}

async function getRecentPipelineRuns(): Promise<PipelineRow[]> {
  const r = await pool.query<PipelineRow>(
    `SELECT DISTINCT ON (source_id)
       source_id, status, items_imported, failures, error_message, detected_at
     FROM pipeline_health
     WHERE detected_at >= NOW() - INTERVAL '24 hours'
     ORDER BY source_id, detected_at DESC`,
  );
  return r.rows;
}

interface PendingEvidence {
  id: number;
  archetype_id: string;
  source_id: string;
  event_label: string;
  event_date: string;
  sample_size: number | null;
  win_rate: number | null;
}

async function getPendingEvidences(): Promise<PendingEvidence[]> {
  const r = await pool.query<PendingEvidence>(
    `SELECT
       id,
       archetype_id,
       source_id,
       event_label,
       event_date::text,
       (data->>'sample_size')::int AS sample_size,
       (data->>'win_rate')::numeric AS win_rate
     FROM meta_archetype_evidences
     WHERE verified = false
     ORDER BY imported_at DESC
     LIMIT 30`,
  );
  return r.rows;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    ok:           "background:#065f46;color:#6ee7b7;",
    broken:       "background:#7f1d1d;color:#fca5a5;",
    import_error: "background:#78350f;color:#fcd34d;",
    skipped:      "background:#1e3a5f;color:#93c5fd;",
    paused:       "background:#374151;color:#9ca3af;",
  };
  const style = colors[status] ?? "background:#374151;color:#9ca3af;";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;${style}">${status}</span>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const [pipelineRuns, pendingEvidences] = await Promise.all([
    getRecentPipelineRuns().catch(() => [] as PipelineRow[]),
    getPendingEvidences().catch(() => [] as PendingEvidence[]),
  ]);

  const brokenCount = pipelineRuns.filter(
    (p) => p.status === "broken" || p.status === "import_error",
  ).length;

  const dateStr = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  // Pipelines table rows
  const allSources = Object.keys(SOURCE_META);
  const runMap = new Map(pipelineRuns.map((r) => [r.source_id, r]));

  const pipelineRows = allSources.map((sid) => {
    const run = runMap.get(sid);
    const meta = SOURCE_META[sid]!;
    const status = run?.status ?? "sem run 24h";
    const items = run?.items_imported ?? "—";
    const ts = run?.detected_at
      ? new Date(run.detected_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
      : "—";

    return `<tr style="border-bottom:1px solid #1f2937;">
      <td style="padding:8px 10px;font-size:12px;color:#e5e7eb;">${escHtml(meta.label)}</td>
      <td style="padding:8px 10px;text-align:center;">${statusBadge(status)}</td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;color:#9ca3af;">${items}</td>
      <td style="padding:8px 10px;font-size:11px;color:#6b7280;">${ts}</td>
    </tr>`;
  }).join("");

  // Pending evidences list
  const pendingRows = pendingEvidences.slice(0, 15).map((ev) => {
    const sourceMeta = SOURCE_META[ev.source_id];
    const sourceLabel = sourceMeta?.label ?? ev.source_id;
    const wr = ev.win_rate != null ? `${Number(ev.win_rate).toFixed(1)}%` : "—";
    const sample = ev.sample_size ?? "—";
    return `<tr style="border-bottom:1px solid #1f2937;">
      <td style="padding:6px 8px;font-size:11px;color:#e5e7eb;">${escHtml(ev.archetype_id)}</td>
      <td style="padding:6px 8px;font-size:11px;color:#9ca3af;">${escHtml(sourceLabel)}</td>
      <td style="padding:6px 8px;font-size:11px;color:#6b7280;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(ev.event_label.slice(0, 50))}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;color:#9ca3af;">${sample}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;color:#9ca3af;">${wr}</td>
    </tr>`;
  }).join("");

  const adminUrl = `${env.APP_URL}/admin`;

  const bodyHtml = `
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#f1f5f9;">Resumo semanal — ${dateStr}</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Deck Sensei · pipelines de evidências</p>

    ${brokenCount > 0 ? `<div style="background:#7f1d1d;border:1px solid #991b1b;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#fca5a5;font-weight:600;">⚠ ${brokenCount} pipeline${brokenCount > 1 ? "s" : ""} com problema nas últimas 24h</p>
    </div>` : ""}

    <h3 style="margin:0 0 10px;font-size:13px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Pipelines (últimas 24h)</h3>
    <table style="width:100%;border-collapse:collapse;background:#111827;border-radius:8px;overflow:hidden;margin-bottom:28px;">
      <thead>
        <tr style="background:#1f2937;">
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Fonte</th>
          <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">Status</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Itens</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Horário</th>
        </tr>
      </thead>
      <tbody>${pipelineRows}</tbody>
    </table>

    ${pendingEvidences.length > 0 ? `
    <h3 style="margin:0 0 10px;font-size:13px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Evidências pendentes (${pendingEvidences.length})</h3>
    <table style="width:100%;border-collapse:collapse;background:#111827;border-radius:8px;overflow:hidden;margin-bottom:28px;">
      <thead>
        <tr style="background:#1f2937;">
          <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Arquetipo</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Fonte</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Evento</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px;color:#6b7280;">Sample</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px;color:#6b7280;">WR</th>
        </tr>
      </thead>
      <tbody>${pendingRows}</tbody>
    </table>
    ` : `<p style="color:#6b7280;font-size:13px;">Nenhuma evidência pendente de verificação.</p>`}

    <div style="text-align:center;margin:24px 0 0;">
      <a href="${adminUrl}/pipelines" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-right:12px;">Ver pipelines →</a>
      <a href="${adminUrl}/evidences" style="display:inline-block;background:#374151;color:#e5e7eb;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Curar evidências →</a>
    </div>
  `;

  const footerHtml = `
    <p style="font-size:11px;color:#4b5563;margin:0;text-align:center;">
      Deck Sensei · digest automático semanal ·
      <a href="${adminUrl}" style="color:#6366f1;">painel admin</a>
    </p>
  `;

  const html = emailShell({
    title: `[Deck Sensei] Resumo semanal — ${dateStr}`,
    bodyHtml,
    footerHtml,
    maxWidth: 640,
  });

  const resend = new Resend(env.RESEND_API_KEY);
  let emailSent = false;
  let emailError: string | null = null;

  try {
    await resend.emails.send({
      from: BRAND_FROM,
      to: env.ADMIN_EMAIL,
      subject: `[Deck Sensei] Resumo semanal — ${dateStr}`,
      html,
    });
    emailSent = true;
  } catch (err) {
    emailError = (err as Error).message;
    console.error("[weekly-digest] erro ao enviar email:", err);
  }

  return Response.json({
    ok: emailSent,
    dateStr,
    pipelinesInLast24h: pipelineRuns.length,
    brokenCount,
    pendingEvidences: pendingEvidences.length,
    emailError,
  });
}
