"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

interface AnalysisStreamProps {
  text: string;
  streaming: boolean;
  onReset: () => void;
}

export default function AnalysisStream({
  text,
  streaming,
  onReset,
}: AnalysisStreamProps) {
  const hasText = text.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Indicador "Analisando..." — pulsa até chegar o primeiro token */}
      {streaming && !hasText && (
        <div className="flex items-center gap-3 py-6">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-primary/70 animate-bounce"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </span>
          <span className="text-sm text-muted-foreground">
            Analisando seu deck...
          </span>
        </div>
      )}

      {/* Markdown em stream */}
      {hasText && (
        <div className="text-sm leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => (
                <h2 className="mt-7 mb-2.5 border-b border-border/40 pb-2 text-[0.875rem] font-semibold text-foreground first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 space-y-1 pl-4">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 list-decimal space-y-1 pl-4">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="list-disc text-sm text-muted-foreground">
                  {children}
                </li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="italic text-muted-foreground/80">{children}</em>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-3 border-l-2 border-primary/50 pl-4 text-muted-foreground/80">
                  {children}
                </blockquote>
              ),
              // Bloco de código — intercepta `sugestoes` para renderização especial
              pre: ({ children }) => {
                const codeEl = React.isValidElement(children) ? children : null;
                const codeProps = codeEl
                  ? (codeEl.props as {
                      className?: string;
                      children?: React.ReactNode;
                    })
                  : null;
                const lang = /language-(\w+)/.exec(
                  codeProps?.className ?? "",
                )?.[1];
                const codeText = String(codeProps?.children ?? "").replace(
                  /\n$/,
                  "",
                );

                if (lang === "sugestoes") {
                  return (
                    <div className="my-4 overflow-hidden rounded-lg border border-primary/25 bg-primary/5">
                      <div className="border-b border-primary/15 px-3 py-1.5 text-xs font-medium text-primary/70">
                        Sugestões de troca
                      </div>
                      <pre className="overflow-x-auto p-3 font-mono text-xs text-muted-foreground">
                        {codeText}
                      </pre>
                    </div>
                  );
                }

                return (
                  <div className="my-3 overflow-x-auto rounded-lg border border-border/30 bg-muted/50 p-3">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">
                      {codeText}
                    </pre>
                  </div>
                );
              },
              // Código inline (sem className = não é bloco)
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
            }}
          >
            {text}
          </ReactMarkdown>
          {/* Cursor piscante durante o stream */}
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-primary/70" />
          )}
        </div>
      )}

      {/* Botão Nova análise — aparece quando o stream termina */}
      {!streaming && hasText && (
        <div className="border-t border-border/30 pt-4">
          <Button variant="outline" size="sm" onClick={onReset}>
            Nova análise
          </Button>
        </div>
      )}
    </div>
  );
}
