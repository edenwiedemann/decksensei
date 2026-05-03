export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdminCookie } from "@/lib/auth/admin";
import { db, pipelineHealthTable } from "@workspace/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  await requireAdminCookie();

  const { sourceId } = await params;
  const body = await req.json() as { paused: boolean };

  if (body.paused) {
    await db.insert(pipelineHealthTable).values({
      sourceId,
      status: "paused",
    });
  } else {
    await db.insert(pipelineHealthTable).values({
      sourceId,
      status: "ok",
      itemsImported: 0,
    });
  }

  return Response.json({ ok: true, paused: body.paused });
}
