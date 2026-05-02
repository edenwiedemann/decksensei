export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

interface UserExportRow {
  id: number;
  email: string;
  city: string | null;
  state: string | null;
  created_at: Date;
  last_seen_at: Date;
  total_analyses: string;
}

function escapeCSV(val: string | number | null | undefined): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function fmtISO(d: Date | null): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const like = q ? `%${q}%` : "%";

  const result = await pool.query<UserExportRow>(
    `SELECT
       u.id, u.email, u.city, u.state, u.created_at, u.last_seen_at,
       COUNT(a.id) FILTER (WHERE a.deleted_at IS NULL)::text AS total_analyses
     FROM users u
     LEFT JOIN analyses a ON a.user_id = u.id
     WHERE u.email ILIKE $1 OR u.city ILIKE $1 OR u.state ILIKE $1
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    [like],
  );

  const headers = ["id", "email", "city", "state", "created_at", "last_seen_at", "total_analyses"];
  const lines: string[] = [headers.join(",")];

  for (const row of result.rows) {
    lines.push(
      [
        escapeCSV(row.id),
        escapeCSV(row.email),
        escapeCSV(row.city),
        escapeCSV(row.state),
        escapeCSV(fmtISO(row.created_at)),
        escapeCSV(fmtISO(row.last_seen_at)),
        escapeCSV(row.total_analyses),
      ].join(","),
    );
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const csv = lines.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="users-${dateStr}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
