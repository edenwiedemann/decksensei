export const runtime = "nodejs";

import { pool } from "@workspace/db";
import { getDailyCost } from "@/lib/cost-tracker";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();
  const uptime_sec = process.uptime();

  // ── DB check ────────────────────────────────────────────────────────────────
  let dbStatus: "ok" | "error" = "error";
  try {
    await pool.query("SELECT 1");
    dbStatus = "ok";
  } catch (err) {
    console.error("[health] db check falhou:", err);
  }

  // ── Env vars (sem chamar APIs externas) ────────────────────────────────────
  const anthropic_key: "set" | "missing" = process.env.ANTHROPIC_API_KEY
    ? "set"
    : "missing";
  const resend_key: "set" | "missing" = process.env.RESEND_API_KEY
    ? "set"
    : "missing";

  // ── Custo diário restante ───────────────────────────────────────────────────
  const capUsd = parseFloat(process.env.DAILY_COST_CAP_USD ?? "10");
  let daily_cost_remaining_usd = capUsd;
  try {
    const spent = await getDailyCost();
    daily_cost_remaining_usd = Math.max(0, capUsd - spent);
  } catch {
    // não critica o health check se o custo falhar
  }
  daily_cost_remaining_usd = parseFloat(daily_cost_remaining_usd.toFixed(4));

  // ── Decisão de status ───────────────────────────────────────────────────────
  const ok = dbStatus === "ok" && anthropic_key === "set";

  const body = {
    ok,
    checks: {
      db: dbStatus,
      anthropic_key,
      resend_key,
      daily_cost_remaining_usd,
    },
    timestamp,
    uptime_sec,
  };

  return Response.json(body, {
    status: ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
