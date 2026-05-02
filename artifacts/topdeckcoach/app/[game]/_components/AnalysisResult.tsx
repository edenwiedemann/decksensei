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
        sections.push({
          title: currentTitle,
          content: currentLines.join("\n").trimStart(),
        });
      }
      currentTitle = line.slice(3).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentLines.join("\n").trimStart(),
    });
  }

  return sections;
}

// ─── Markdown components ──────────────────────────────────────────────────────

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] =
  {
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
    ul: ({ children }) => (
      <ul className="mb-3 flex flex-col gap-1 pl-5">{children}</ul>
    ),
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
        ? (codeEl.props as {
            className?: string;
            children?: React.ReactNode;
          })
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
          <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">
            {codeText}
          </pre>
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

// ─── SectionCard ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: Section;
  isLast: boolean;
  streaming: boolean;
}

function SectionCard({ section, isLast, streaming }: SectionCardProps) {
  const meta = SECTION_META[section.title] ?? DEFAULT_META;
  const Icon = meta.icon;

  const showCursor = isLast && streaming;

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
      <div className="px-5 py-5">
        {section.content.trim() ? (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {section.content}
            </ReactMarkdown>
            {showCursor && (
              <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse align-middle bg-primary/60" />
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 py-2">
            {showCursor ? (
              <span className="h-3.5 w-0.5 animate-pulse bg-primary/60" />
            ) : (
              <span className="text-xs text-muted-foreground/40 italic">
                carregando...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AnalysisResult ───────────────────────────────────────────────────────────

interface AnalysisResultProps {
  text: string;
  streaming: boolean;
}

export default function AnalysisResult({
  text,
  streaming,
}: AnalysisResultProps) {
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
        />
      ))}
    </div>
  );
}
