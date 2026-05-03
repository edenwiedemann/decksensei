export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdminCookie } from "@/lib/auth/admin";
import { pool } from "@workspace/db";
import { Resend } from "resend";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdminCookie();

  const { id } = await params;
  const snapshotId = parseInt(id, 10);
  if (isNaN(snapshotId)) {
    return Response.json({ error: "ID inválido" }, { status: 400 });
  }

  // Fetch snapshot info
  const snapResult = await pool.query<{ game_id: string; version: string }>(
    `SELECT game_id, version FROM meta_snapshots WHERE id = $1 LIMIT 1`,
    [snapshotId],
  );
  const snap = snapResult.rows[0];
  if (!snap) {
    return Response.json({ error: "Snapshot não encontrado" }, { status: 404 });
  }

  // Fetch users who analyzed in the last 30 days for this game
  const usersResult = await pool.query<{ email: string }>(
    `SELECT DISTINCT u.email
     FROM analyses a
     JOIN users u ON u.id = a.user_id
     WHERE a.game_id = $1
       AND a.created_at >= NOW() - INTERVAL '30 days'
       AND a.deleted_at IS NULL
       AND u.email IS NOT NULL
     ORDER BY u.email`,
    [snap.game_id],
  );

  const emails = usersResult.rows.map((r) => r.email).filter(Boolean);
  if (emails.length === 0) {
    return Response.json({ ok: true, sent: 0, total: 0 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;

  // Batch of 10 to stay inside Resend burst limits
  const BATCH = 10;
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map((email) =>
        resend.emails.send({
          from: "Deck Sensei <noreply@decksensei.com.br>",
          to: email,
          subject: `Meta atualizado — hora de reanalisar seu deck! 🎴`,
          html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:ui-sans-serif,system-ui,sans-serif;color:#e0e0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <tr><td>
      <h2 style="color:#a78bfa;margin:0 0 8px;">O meta mudou! 🎴</h2>
      <p style="color:#94a3b8;margin:0 0 16px;font-size:14px;line-height:1.6;">
        Uma nova versão do meta Digimon Card Game (<strong style="color:#e0e0f0;">${snap.version}</strong>) acabou de ser publicada.
      </p>
      <p style="color:#94a3b8;margin:0 0 24px;font-size:14px;line-height:1.6;">
        Os arquetipos mudaram — vale reanalisar seu deck para ver como ele se sai com as novas informações de meta.
      </p>
      <a href="https://decksensei.com.br/${snap.game_id}"
         style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
        Reanalisar meu deck →
      </a>
      <p style="margin:32px 0 0;font-size:11px;color:#475569;">
        Deck Sensei · feito com carinho em Recife
      </p>
    </td></tr>
  </table>
</body>
</html>`,
        }),
      ),
    );
    sent += batch.length;
  }

  return Response.json({ ok: true, sent, total: emails.length });
}
