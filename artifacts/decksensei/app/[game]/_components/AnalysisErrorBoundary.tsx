"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  children: React.ReactNode;
  /** Texto bruto da análise para exibir no fallback. */
  fallbackText: string;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary que captura erros de renderização do AnalysisResult.
 * Exibe o markdown puro em vez de uma tela em branco.
 */
export default class AnalysisErrorBoundary extends React.Component<
  Props,
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(
      "[AnalysisErrorBoundary] erro ao renderizar análise:",
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground/60">
          Erro ao exibir a análise. Mostrando versão simplificada.
        </div>
        <div className="rounded-xl border border-border/50 bg-card px-5 py-5 text-sm leading-relaxed text-muted-foreground [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_li]:list-disc">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {this.props.fallbackText}
          </ReactMarkdown>
        </div>
      </div>
    );
  }
}
