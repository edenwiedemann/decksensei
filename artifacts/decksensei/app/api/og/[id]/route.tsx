export const runtime = "nodejs";

import { ImageResponse } from "@vercel/og";
import { type NextRequest } from "next/server";
import { db, analysesTable, gamesTable, eq, and, isNull } from "@workspace/db";
import { computeDeckGrade } from "@/lib/deck-score";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractArchetype(text: string): string | null {
  const m = text.match(/Arquetipo mais pr[oó]ximo:\s*\*\*([^*]+)\*\*/);
  return m ? m[1].trim() : null;
}

const GRADE_THEME = {
  A: { color: "#34d399", bg: "rgba(52,211,153,0.15)", border: "rgba(52,211,153,0.35)" },
  B: { color: "#38bdf8", bg: "rgba(56,189,248,0.15)", border: "rgba(56,189,248,0.35)" },
  C: { color: "#fbbf24", bg: "rgba(251,191,36,0.15)",  border: "rgba(251,191,36,0.35)"  },
  D: { color: "#fb7185", bg: "rgba(251,113,133,0.15)", border: "rgba(251,113,133,0.35)" },
} as const;

type GradeLetter = keyof typeof GRADE_THEME;
type GradeTheme = typeof GRADE_THEME[GradeLetter];

// ─── Route ────────────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const [row] = await db
    .select({
      analysisText: analysesTable.analysisText,
      deckName: analysesTable.deckName,
      similarArchetypeId: analysesTable.similarArchetypeId,
      gameName: gamesTable.name,
    })
    .from(analysesTable)
    .innerJoin(gamesTable, eq(gamesTable.id, analysesTable.gameId))
    .where(and(eq(analysesTable.id, id), isNull(analysesTable.deletedAt)))
    .limit(1);

  if (!row) {
    return new ImageResponse(<NotFoundCard />, {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  }

  const grade = computeDeckGrade(row.analysisText);
  const archetype = extractArchetype(row.analysisText) ?? row.similarArchetypeId ?? null;
  const theme = grade ? GRADE_THEME[grade.grade] : null;

  const headline = row.deckName ?? archetype ?? row.gameName;
  const subline = row.deckName && archetype ? archetype : null;

  return new ImageResponse(
    <AnalysisCard
      headline={headline}
      subline={subline}
      gameName={row.gameName}
      grade={grade?.grade ?? null}
      theme={theme}
    />,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    },
  );
}

// ─── JSX card components (rendered by satori) ─────────────────────────────────

function NotFoundCard() {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "hsl(240,30%,5%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
      }}
    >
      <span style={{ color: "#6b7280", fontSize: 32 }}>Deck Sensei</span>
    </div>
  );
}

interface CardProps {
  headline: string;
  subline: string | null;
  gameName: string;
  grade: GradeLetter | null;
  theme: GradeTheme | null;
}

function AnalysisCard({ headline, subline, gameName, grade, theme }: CardProps) {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "linear-gradient(135deg, hsl(240,30%,5%) 0%, hsl(240,25%,9%) 60%, hsl(240,22%,12%) 100%)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Accent glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle at 80% 20%, rgba(99,102,241,0.08) 0%, transparent 60%)",
          display: "flex",
        }}
      />

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "64px 72px",
          justifyContent: "space-between",
        }}
      >
        {/* Top: branding + game */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-0.5px" }}>
            Deck Sensei
          </span>
          <div style={{ height: 20, width: 1, background: "rgba(255,255,255,0.15)", display: "flex" }} />
          <span style={{ fontSize: 18, color: "#94a3b8", fontWeight: 500 }}>
            {gameName}
          </span>
        </div>

        {/* Middle: grade badge + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          {grade && theme && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 140,
                height: 140,
                borderRadius: 24,
                background: theme.bg,
                border: `3px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 88, fontWeight: 900, color: theme.color, lineHeight: 1 }}>
                {grade}
              </span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: headline.length > 28 ? 46 : 58,
                fontWeight: 800,
                color: "#f1f5f9",
                letterSpacing: "-1px",
                lineHeight: 1.1,
                wordBreak: "break-word",
              }}
            >
              {headline}
            </span>
            {subline && (
              <span style={{ fontSize: 28, color: "#94a3b8", fontWeight: 500, letterSpacing: "-0.3px" }}>
                {subline}
              </span>
            )}
          </div>
        </div>

        {/* Bottom: tagline */}
        <div style={{ display: "flex" }}>
          <span style={{ fontSize: 18, color: "rgba(148,163,184,0.7)", fontWeight: 400 }}>
            Análise de deck gerada por IA · decksensei.com.br
          </span>
        </div>
      </div>

      {/* Right accent bar */}
      {theme && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 6,
            background: `linear-gradient(to bottom, transparent, ${theme.color}, transparent)`,
            display: "flex",
          }}
        />
      )}
    </div>
  );
}
