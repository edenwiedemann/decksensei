"use client";

import React from "react";
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
  type LucideIcon,
} from "lucide-react";
import SuggestionsCard, { parseSuggestionsBlock } from "./SuggestionsCard";
import type { SuggestionsParseResult } from "./SuggestionsCard";
import FeedbackBlock from "./FeedbackBlock";

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
}

function SectionCard({ section, isLast, streaming, colorMap }: SectionCardProps) {
  const meta = SECTION_META[section.title] ?? DEFAULT_META;
  const Icon = meta.icon;
  const showCursor = isLast && streaming;

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

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
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
      </div>

      {/* Content */}
      <div className="px-5 py-5">{renderContent()}</div>
    </div>
  );
}

// ─── AnalysisResult ───────────────────────────────────────────────────────────

interface AnalysisResultProps {
  text: string;
  streaming: boolean;
  colorMap: Record<string, string>;
  analysisId?: string;
}

export default function AnalysisResult({ text, streaming, colorMap, analysisId }: AnalysisResultProps) {
  const sections = parseSections(text);
  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, i) => (
        <SectionCard
          key={section.title || i}
          section={section}
          isLast={i === sections.length - 1}
          streaming={streaming}
          colorMap={colorMap}
        />
      ))}

      {!streaming && analysisId && (
        <FeedbackBlock analysisId={analysisId} />
      )}
    </div>
  );
}
