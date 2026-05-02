"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownViewer({ content }: { content: string }) {
  const [raw, setRaw] = useState(false);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setRaw((p) => !p)}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          {raw ? "Ver formatado" : "Ver raw"}
        </button>
      </div>

      {raw ? (
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
          {content}
        </pre>
      ) : (
        <div className="text-sm leading-relaxed text-foreground/90">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="mb-3 mt-6 text-lg font-bold text-foreground first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-semibold text-foreground">{children}</h2>,
              h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">{children}</h3>,
              p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
              ul: ({ children }) => <ul className="mb-3 ml-4 flex flex-col gap-1 list-disc">{children}</ul>,
              ol: ({ children }) => <ol className="mb-3 ml-4 flex flex-col gap-1 list-decimal">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed text-foreground/80">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
              code: ({ children }) => <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs">{children}</code>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground">{children}</blockquote>,
              hr: () => <hr className="my-4 border-border/30" />,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
