"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Eye,
  Swords,
  Shield,
  AlertTriangle,
  BarChart3,
  Lightbulb,
  FileText,
  Copy,
  Check,
  Link,
  Info,
  ThumbsUp,
  ThumbsDown,
  Download,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { sectionSlug } from "@/lib/deck-score";
import SuggestionsCard, { parseSuggestionsBlock } from "./SuggestionsCard";
import type { SuggestionsParseResult } from "./SuggestionsCard";
import FeedbackBlock from "./FeedbackBlock";
import { trackEvent } from "@/lib/posthog-client";

// ─── Configuração das seções ──────────────────────────────────────────────────

interface SectionMeta {
  icon: LucideIcon;
  iconClass: string;
  bgClass: string;
  borderClass: string;
}

const SECTION_META: Record<string, SectionMeta> = {
  "Visão geral": {
    icon: Eye,
    iconClass: "text-sky-400",
    bgClass: "bg-sky-400/10",
    borderClass: "border-sky-400/20",
  },
  "Plano de jogo": {
    icon: Swords,
    iconClass: "text-purple-400",
    bgClass: "bg-purple-400/10",
    borderClass: "border-purple-400/20",
  },
  "Pontos fortes": {
    icon: Shield,
    iconClass: "text-emerald-400",
    bgClass: "bg-emerald-400/10",
    borderClass: "border-emerald-400/20",
  },
  "Vulnerabilidades": {
    icon: AlertTriangle,
    iconClass: "text-amber-400",
    bgClass: "bg-amber-400/10",
    borderClass: "border-amber-400/20",
  },
  "Comparação com o meta": {
    icon: BarChart3,
    iconClass: "text-cyan-400",
    bgClass: "bg-cyan-400/10",
    borderClass: "border-cyan-400/20",
  },
  "Sugestões de troca": {
    icon: Lightbulb,
    iconClass: "text-yellow-400",
    bgClass: "bg-yellow-400/10",
    borderClass: "border-yellow-400/20",
  },
};

const DEFAULT_META: SectionMeta = {
  icon: FileText,
  iconClass: "text-muted-foreground",
  bgClass: "bg-muted/40",
  borderClass: "border-border/30",
};

// ─── Score do deck (A/B/C/D) ──────────────────────────────────────────────────

function computeDeckGrade(text: string): { grade: "A" | "B" | "C" | "D"; pct: number } | null {
  const m = text.match(/similaridade aproximada\s*\*\*(\d+)%\*?\*?/);
  if (!m) return null;
  const pct = parseInt(m[1], 10);
  return {
    grade: pct >= 80 ? "A" : pct >= 65 ? "B" : pct >= 50 ? "C" : "D",
    pct,
  };
}

const GRADE_STYLES = {
  A: { border: "border-emerald-400/30", bg: "bg-emerald-400/10", text: "text-emerald-400", label: "Deck forte" },
  B: { border: "border-sky-400/30",     bg: "bg-sky-400/10",     text: "text-sky-400",     label: "Deck sólido" },
  C: { border: "border-amber-400/30",   bg: "bg-amber-400/10",   text: "text-amber-400",   label: "Deck com margem" },
  D: { border: "border-rose-400/30",    bg: "bg-rose-400/10",    text: "text-rose-400",    label: "Deck inicial" },
} as const;

function DeckScoreBadge({ grade, pct }: { grade: "A" | "B" | "C" | "D"; pct: number }) {
  const s = GRADE_STYLES[grade];
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className={`relative flex items-center gap-4 rounded-xl border ${s.border} ${s.bg} px-5 py-4`}>
      <span className={`text-4xl font-black tabular-nums leading-none ${s.text}`}>
        {grade}
      </span>
      <div className="flex-1">
        <p className={`text-sm font-bold ${s.text}`}>{s.label}</p>
        <p className="text-xs text-muted-foreground">
          {pct}% de similaridade com o arquetipo mais próximo do meta
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShowInfo((v) => !v)}
        className="shrink-0 rounded-full p-1 text-muted-foreground/40 transition-colors hover:text-muted-foreground/80"
        aria-label="Entenda o score"
        title="Como o score é calculado"
      >
        <Info className="h-4 w-4" />
      </button>
      {showInfo && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-border/50 bg-card p-4 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-foreground">Como o score é calculado</p>
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            Comparamos seu deck com os arquétipos do meta e medimos a{" "}
            <span className="text-foreground">% de similaridade</span> de cartas com o mais próximo.
          </p>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            <li><span className="font-bold text-emerald-400">A</span> — ≥ 80% · muito próximo do meta</li>
            <li><span className="font-bold text-sky-400">B</span> — 65–79% · sólido e competitivo</li>
            <li><span className="font-bold text-amber-400">C</span> — 50–64% · funcional, com margem</li>
            <li><span className="font-bold text-rose-400">D</span> — &lt; 50% · iniciante ou fora do meta</li>
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/60">
            Score alto não é obrigatório — um D bem executado pode bater um A!
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Mapa de cores Digimon → CSS ──────────────────────────────────────────────

const DIGIMON_COLOR_CSS: Record<string, { text: string; bg: string; border: string; bar: string }> = {
  Red:    { text: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/30",    bar: "bg-red-400" },
  Blue:   { text: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/30",   bar: "bg-blue-400" },
  Yellow: { text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30", bar: "bg-yellow-400" },
  Green:  { text: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/30",  bar: "bg-green-400" },
  Black:  { text: "text-zinc-300",   bg: "bg-zinc-400/10",   border: "border-zinc-400/30",   bar: "bg-zinc-400" },
  Purple: { text: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/30", bar: "bg-purple-400" },
  White:  { text: "text-slate-200",  bg: "bg-slate-300/10",  border: "border-slate-300/30",  bar: "bg-slate-300" },
};

function getColorCss(color?: string) {
  return DIGIMON_COLOR_CSS[color ?? ""] ?? {
    text: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/30",
    bar: "bg-cyan-400",
  };
}

// ─── Parser de seções ─────────────────────────────────────────────────────────

interface Section {
  title: string;
  content: string;
}

/**
 * Divide o markdown em seções pela quebra `## Heading`.
 * Funciona durante o streaming — a última seção pode ter conteúdo parcial.
 */
function parseSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentLines.join("\n").trimStart() });
      }
      currentTitle = line.slice(3).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentLines.join("\n").trimStart() });
  }

  return sections;
}

// ─── Parser do card de comparação ────────────────────────────────────────────

interface ComparisonData {
  archetypeName: string;
  similarity: number;
  bullets: Array<{ kind: "plus" | "minus"; text: string }>;
}

/**
 * Tenta extrair dados estruturados da seção "Comparação com o meta".
 * Procura o padrão de blockquote e os bullets que seguem.
 * Retorna null se o conteúdo ainda é parcial (streaming).
 */
function parseComparison(content: string): ComparisonData | null {
  const quoteMatch = content.match(
    /Arquetipo mais pr[oó]ximo:\s*\*\*([^*]+)\*\*\s*[—–\-]\s*similaridade aproximada\s*\*\*(\d+)%\*?\*?/,
  );
  if (!quoteMatch) return null;

  const archetypeName = quoteMatch[1].trim();
  const similarity = parseInt(quoteMatch[2], 10);

  // Extrai bullets que começam com - **A mais:** ou - **Falta:**
  const bullets: Array<{ kind: "plus" | "minus"; text: string }> = [];
  const bulletRegex = /^[-*]\s+\*\*([^*]+)\*\*:?\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = bulletRegex.exec(content)) !== null) {
    const label = m[1].trim().toLowerCase();
    const text = m[2].trim();
    if (label.includes("mais") || label.includes("vantagem") || label.includes("diferencial")) {
      bullets.push({ kind: "plus", text });
    } else if (label.includes("falta") || label.includes("lacuna") || label.includes("menos")) {
      bullets.push({ kind: "minus", text });
    }
  }

  if (bullets.length === 0) return null;

  return { archetypeName, similarity, bullets };
}

// ─── Markdown components ──────────────────────────────────────────────────────

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => <ul className="mb-3 flex flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal flex flex-col gap-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="list-disc text-sm leading-relaxed text-muted-foreground marker:text-muted-foreground/50">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-muted-foreground/80">{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/40 pl-4 text-muted-foreground/80">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => {
    const codeEl = React.isValidElement(children) ? children : null;
    const codeProps = codeEl
      ? (codeEl.props as { className?: string; children?: React.ReactNode })
      : null;
    const lang = /language-(\w+)/.exec(codeProps?.className ?? "")?.[1];
    const codeText = String(codeProps?.children ?? "").replace(/\n$/, "");

    if (lang === "sugestoes") {
      return (
        <div className="mt-4 overflow-hidden rounded-lg border border-primary/20 bg-primary/5">
          <div className="border-b border-primary/10 px-4 py-2 text-xs font-medium text-primary/60">
            trocas sugeridas
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {codeText}
          </pre>
        </div>
      );
    }

    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-border/30 bg-muted/40 p-3">
        <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">{codeText}</pre>
      </div>
    );
  },
  code: ({ className, children }) => {
    if (!className) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          {children}
        </code>
      );
    }
    return <code className={className}>{children}</code>;
  },
};

// ─── ComparisonCard ───────────────────────────────────────────────────────────

interface ComparisonCardProps {
  comparison: ComparisonData;
  archetypeColor?: string;
}

function ComparisonCard({ comparison, archetypeColor }: ComparisonCardProps) {
  const css = getColorCss(archetypeColor);

  return (
    <div className={`rounded-xl border ${css.border} ${css.bg} px-5 py-5`}>
      {/* Nome do arquetipo + % */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <span className={`text-base font-bold ${css.text}`}>
          {comparison.archetypeName}
        </span>
        <span className="text-xs text-muted-foreground">
          arquetipo mais próximo
        </span>
      </div>

      {/* Barra de similaridade */}
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Similaridade</span>
        <span className={`font-semibold tabular-nums ${css.text}`}>
          {comparison.similarity}%
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className={`h-full rounded-full ${css.bar} transition-all duration-700`}
          style={{ width: `${comparison.similarity}%` }}
        />
      </div>

      {/* Bullets: A mais / Falta */}
      <ul className="flex flex-col gap-2">
        {comparison.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span
              className={`mt-0.5 shrink-0 font-bold ${b.kind === "plus" ? "text-emerald-400" : "text-amber-400"}`}
            >
              {b.kind === "plus" ? "+" : "−"}
            </span>
            <span className="text-muted-foreground leading-snug">{b.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: Section;
  isLast: boolean;
  streaming: boolean;
  colorMap: Record<string, string>;
  analysisId?: string;
}

function SectionCard({ section, isLast, streaming, colorMap, analysisId }: SectionCardProps) {
  const meta = SECTION_META[section.title] ?? DEFAULT_META;
  const Icon = meta.icon;
  const showCursor = isLast && streaming;
  const [sectionCopied, setSectionCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sectionRating, setSectionRating] = useState<"up" | "down" | null>(null);

  async function handleSectionRating(rating: "up" | "down") {
    if (sectionRating !== null || !analysisId) return;
    setSectionRating(rating);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          rating,
          comment: `[section:${sectionSlug(section.title)}]`,
        }),
      });
    } catch {
      // best-effort — não revertemos o estado visual
    }
  }

  async function handleLinkCopy() {
    try {
      const slug = sectionSlug(section.title);
      const base = window.location.href.split("#")[0];
      await navigator.clipboard.writeText(`${base}#${slug}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {}
  }

  async function handleSectionCopy() {
    try {
      const clean = section.content
        .replace(/```sugestoes[\s\S]*?```/g, "")
        .replace(/```[\s\S]*?```/g, "")
        .trim();
      await navigator.clipboard.writeText(`## ${section.title}\n\n${clean}`);
      setSectionCopied(true);
      setTimeout(() => setSectionCopied(false), 2000);
    } catch {
      // clipboard API indisponível
    }
  }

  const isComparison = section.title === "Comparação com o meta";
  const isSuggestions = section.title === "Sugestões de troca";

  const comparison = isComparison ? parseComparison(section.content) : null;
  const archetypeColor = comparison ? colorMap[comparison.archetypeName] : undefined;

  // Para sugestões: só renderiza o card especial quando o stream terminou
  // (assim o bloco ```sugestoes``` está completo e parseável)
  const suggestionsResult: SuggestionsParseResult | null =
    isSuggestions && !streaming
      ? parseSuggestionsBlock(section.content)
      : null;

  function renderContent() {
    if (!section.content.trim()) {
      return (
        <div className="flex items-center gap-2 py-2">
          {showCursor ? (
            <span className="h-3.5 w-0.5 animate-pulse bg-primary/60" />
          ) : (
            <span className="text-xs text-muted-foreground/40 italic">carregando...</span>
          )}
        </div>
      );
    }

    // Seção de sugestões com card especial (stream terminou + parse ok)
    if (isSuggestions && suggestionsResult?.ok === true) {
      return <SuggestionsCard suggestions={suggestionsResult.data} />;
    }

    // Fallback quando o JSON do bloco sugestoes estava malformado
    if (isSuggestions && suggestionsResult?.ok === false) {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground/70">
            Não conseguimos exibir as sugestões em formato visual. Veja o texto
            cru abaixo:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border/30 bg-muted/20 px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap break-all">
            {suggestionsResult.raw}
          </pre>
        </div>
      );
    }

    // Seção de sugestões ainda streamando — mostra markdown puro (inclui o JSON bruto)
    // e um indicador de "montando..."
    if (isSuggestions && streaming) {
      return (
        <div className="flex items-center gap-2 py-3">
          <span className="h-3.5 w-0.5 animate-pulse bg-primary/60" />
          <span className="text-xs text-muted-foreground/50 italic">montando sugestões...</span>
        </div>
      );
    }

    // Seção de comparação com card especial
    if (isComparison && comparison) {
      return (
        <div className="flex flex-col gap-4">
          <ComparisonCard comparison={comparison} archetypeColor={archetypeColor} />
          {streaming && (
            <div className="text-xs text-muted-foreground/50 italic">analisando...</div>
          )}
        </div>
      );
    }

    // Markdown padrão para todas as outras seções
    return (
      <>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {section.content}
        </ReactMarkdown>
        {showCursor && (
          <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse align-middle bg-primary/60" />
        )}
      </>
    );
  }

  const slug = sectionSlug(section.title);

  return (
    <div id={slug} className="overflow-hidden rounded-xl border border-border/50 bg-card scroll-mt-20">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.bgClass} ${meta.borderClass}`}
        >
          <Icon className={`h-4 w-4 ${meta.iconClass}`} />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {section.title}
        </h2>
        {!streaming && (
          <div className="ml-auto flex items-center gap-0.5">
            {/* Feedback por seção */}
            {analysisId && (
              <>
                <button
                  type="button"
                  onClick={() => void handleSectionRating("up")}
                  disabled={sectionRating !== null}
                  className={`rounded p-1.5 transition-colors ${
                    sectionRating === "up"
                      ? "text-emerald-400"
                      : "text-muted-foreground/20 hover:text-emerald-400/70"
                  } disabled:pointer-events-none`}
                  aria-label="Seção útil"
                  title="Seção útil"
                >
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleSectionRating("down")}
                  disabled={sectionRating !== null}
                  className={`rounded p-1.5 transition-colors ${
                    sectionRating === "down"
                      ? "text-amber-400"
                      : "text-muted-foreground/20 hover:text-amber-400/70"
                  } disabled:pointer-events-none`}
                  aria-label="Seção não útil"
                  title="Seção não útil"
                >
                  <ThumbsDown className="h-3 w-3" />
                </button>
                <span className="mx-1 h-3.5 w-px bg-border/40" />
              </>
            )}
            <button
              onClick={handleLinkCopy}
              className="rounded p-1.5 text-muted-foreground/20 transition-colors hover:text-muted-foreground/60"
              aria-label="Copiar link para esta seção"
              title="Copiar link"
            >
              {linkCopied
                ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                : <Link className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={handleSectionCopy}
              className="rounded p-1.5 text-muted-foreground/25 transition-colors hover:text-muted-foreground/70"
              aria-label="Copiar seção"
              title="Copiar texto"
            >
              {sectionCopied
                ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-5">{renderContent()}</div>
    </div>
  );
}

// ─── Detecção de formato esperado ────────────────────────────────────────────

const EXPECTED_HEADERS = [
  "## Visão geral",
  "## Plano de jogo",
  "## Pontos fortes",
  "## Vulnerabilidades",
  "## Comparação com o meta",
  "## Sugestões de troca",
];

// ─── CopyAllButton ────────────────────────────────────────────────────────────

function CopyAllButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      const clean = text
        .replace(/```sugestoes[\s\S]*?```/g, "")
        .replace(/```[\s\S]*?```/g, "")
        .trim();
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:border-border/70 hover:text-muted-foreground"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copiado!" : "Copiar tudo"}
    </button>
  );
}

// ─── ExportImageButton ────────────────────────────────────────────────────────

function ExportImageButton({
  containerRef,
  grade,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  grade: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (!containerRef.current) return;
    setLoading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(containerRef.current, {
        cacheBust: true,
        backgroundColor: "hsl(240 30% 5%)",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `deck-sensei-${grade}.png`;
      a.click();
    } catch (err) {
      console.error("Export PNG failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:border-border/70 hover:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          Gerando...
        </>
      ) : (
        <>
          <Download className="h-3 w-3" />
          Baixar análise
        </>
      )}
    </button>
  );
}

// ─── ShareMenu ────────────────────────────────────────────────────────────────

function ShareMenu({
  grade,
  archetypeName,
  shareUrl,
}: {
  grade: string;
  archetypeName?: string;
  shareUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function getUrl() {
    return shareUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  }

  function buildShareText() {
    const arch = archetypeName ? ` (${archetypeName})` : "";
    return `Meu deck recebeu nota ${grade}${arch} no Deck Sensei! Confira a análise completa: ${getUrl()}`;
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText())}`, "_blank");
    setOpen(false);
  }

  function handleTwitter() {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText())}`, "_blank");
    setOpen(false);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(getUrl());
      setLinkCopied(true);
      setTimeout(() => {
        setLinkCopied(false);
        setOpen(false);
      }, 1500);
    } catch {}
  }

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:border-border/70 hover:text-muted-foreground"
      >
        <Share2 className="h-3 w-3" />
        Compartilhar
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-48 overflow-hidden rounded-xl border border-border/50 bg-card shadow-xl">
          <button
            type="button"
            onClick={handleWhatsApp}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current text-emerald-500" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.558 4.112 1.528 5.84L.057 23.512a.5.5 0 0 0 .609.61l5.78-1.516A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.368l-.36-.214-3.726.977.995-3.633-.235-.374A9.818 9.818 0 1 1 12 21.818z" />
            </svg>
            WhatsApp
          </button>

          <button
            type="button"
            onClick={handleTwitter}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.631L18.244 2.25zM17.083 20.001h1.834L6.957 4.126H4.993L17.083 20.001z" />
            </svg>
            Twitter / X
          </button>

          <div className="h-px bg-border/30" />

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            {linkCopied ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <Link className="h-4 w-4 shrink-0" />
            )}
            {linkCopied ? "Copiado!" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── FallbackProse ────────────────────────────────────────────────────────────

interface FallbackProseProps {
  text: string;
  analysisId?: string;
}

function FallbackProse({ text, analysisId }: FallbackProseProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground/60">
        Formato inesperado da análise. Reportamos pro time.
      </div>
      <div className="rounded-xl border border-border/50 bg-card px-5 py-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {text}
        </ReactMarkdown>
      </div>
      {analysisId && <FeedbackBlock analysisId={analysisId} />}
    </div>
  );
}

// ─── AnalysisResult ───────────────────────────────────────────────────────────

interface AnalysisResultProps {
  text: string;
  streaming: boolean;
  colorMap: Record<string, string>;
  analysisId?: string;
  shareUrl?: string;
}

export default function AnalysisResult({ text, streaming, colorMap, analysisId, shareUrl }: AnalysisResultProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Só verifica o formato depois que o stream terminou — durante o stream o
  // texto é parcial e os headers chegam progressivamente.
  if (!streaming) {
    const missing = EXPECTED_HEADERS.filter((h) => !text.includes(h));
    if (missing.length > 0) {
      console.warn(
        "[AnalysisResult] Formato inesperado — headers ausentes. Considerar prompt mais estrito.",
        { missing },
      );
      trackEvent("analysis_format_fallback", { missing, analysisId });
      return <FallbackProse text={text} analysisId={analysisId} />;
    }
  }

  const sections = parseSections(text);
  if (sections.length === 0) return null;

  const deckScore = !streaming ? computeDeckGrade(text) : null;

  const archetypeName = !streaming
    ? (() => {
        const m = text.match(/Arquetipo mais pr[oó]ximo:\s*\*\*([^*]+)\*\*/);
        return m ? m[1].trim() : undefined;
      })()
    : undefined;

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {deckScore && (
        <DeckScoreBadge grade={deckScore.grade} pct={deckScore.pct} />
      )}
      {!streaming && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportImageButton containerRef={containerRef} grade={deckScore?.grade ?? "?"} />
          <ShareMenu
            grade={deckScore?.grade ?? "?"}
            archetypeName={archetypeName}
            shareUrl={shareUrl}
          />
          <CopyAllButton text={text} />
        </div>
      )}
      {sections.map((section, i) => (
        <SectionCard
          key={section.title || i}
          section={section}
          isLast={i === sections.length - 1}
          streaming={streaming}
          colorMap={colorMap}
          analysisId={analysisId}
        />
      ))}

      {!streaming && analysisId && (
        <FeedbackBlock analysisId={analysisId} />
      )}
    </div>
  );
}
