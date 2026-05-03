"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ArrowRight, X } from "lucide-react";
import { trackEvent } from "@/lib/posthog-client";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SwapSuggestion {
  remove: { code: string; name: string; qty: number };
  add: { code: string; name: string; qty: number };
  reason_pt: string;
}

// ─── Parser do bloco ```sugestoes ... ``` ────────────────────────────────────

export type SuggestionsParseResult =
  | { ok: true; data: SwapSuggestion[] }
  | { ok: false; raw: string };

/**
 * Extrai e faz parse do bloco JSON dentro de ```sugestoes ... ```.
 *
 * Retorna:
 *   null                    → bloco ainda não chegou (streaming) ou array vazio após filtro
 *   { ok: true, data }      → parseado com sucesso
 *   { ok: false, raw }      → bloco encontrado mas JSON inválido (loga console.warn)
 */
export function parseSuggestionsBlock(
  markdown: string,
): SuggestionsParseResult | null {
  const match = markdown.match(/```sugestoes\s*([\s\S]*?)```/);
  if (!match) return null;
  const raw = match[1].trim();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const data = (parsed as SwapSuggestion[]).filter(
      (s) =>
        s?.remove?.code &&
        s?.remove?.name &&
        s?.add?.code &&
        s?.add?.name &&
        typeof s?.reason_pt === "string",
    );
    if (data.length === 0) return null;
    return { ok: true, data };
  } catch (err) {
    console.warn(
      "[SuggestionsCard] JSON.parse falhou no bloco ```sugestoes``` — " +
        "considerar ajuste no prompt para formato mais estrito.",
      { raw, err },
    );
    trackEvent("suggestions_json_error", { raw: raw.slice(0, 300), error: String(err) });
    return { ok: false, raw };
  }
}

// ─── Utilitário de imagem Digimon ─────────────────────────────────────────────

/**
 * Constrói URL de imagem da carta a partir do código.
 * Formato digimoncard.io: /images/cards/{SET}-{NUM}.jpg
 * Fallback: null → mostra placeholder.
 */
function digimonImageUrl(code: string): string {
  return `https://digimoncard.io/images/cards/${code}.jpg`;
}

// ─── CardImage ────────────────────────────────────────────────────────────────

interface CardImageProps {
  code: string;
  name: string;
  size?: "sm" | "lg";
  onClick?: () => void;
}

function CardImage({ code, name, size = "sm", onClick }: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = digimonImageUrl(code);

  const wClass =
    size === "lg"
      ? "h-64 w-44 rounded-xl"
      : "h-28 w-20 rounded-lg";

  if (errored) {
    return (
      <div
        className={`${wClass} flex flex-col items-center justify-center gap-1 border border-border/30 bg-muted/40 cursor-${onClick ? "pointer" : "default"}`}
        onClick={onClick}
      >
        <span className="font-mono text-[9px] text-muted-foreground/60 text-center px-1 leading-tight">
          {code}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${wClass} relative overflow-hidden border border-border/20 bg-muted/20 ${onClick ? "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" : ""}`}
      onClick={onClick}
      title={name}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted/30" />
      )}
      <img
        src={url}
        alt={name}
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        draggable={false}
      />
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

interface LightboxProps {
  suggestion: SwapSuggestion;
  onClose: () => void;
}

function Lightbox({ suggestion, onClose }: LightboxProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-6 rounded-2xl border border-border/40 bg-card p-6 shadow-2xl max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fechar */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Cartas grandes lado a lado */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <CardImage code={suggestion.remove.code} name={suggestion.remove.name} size="lg" />
            <div className="text-center">
              <p className="text-xs font-semibold text-rose-400">
                − {suggestion.remove.qty}× removido
              </p>
              <p className="text-xs text-muted-foreground">{suggestion.remove.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground/50">{suggestion.remove.code}</p>
            </div>
          </div>

          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground/50" />

          <div className="flex flex-col items-center gap-2">
            <CardImage code={suggestion.add.code} name={suggestion.add.name} size="lg" />
            <div className="text-center">
              <p className="text-xs font-semibold text-emerald-400">
                + {suggestion.add.qty}× adicionado
              </p>
              <p className="text-xs text-muted-foreground">{suggestion.add.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground/50">{suggestion.add.code}</p>
            </div>
          </div>
        </div>

        {/* Justificativa */}
        <p className="text-center text-sm leading-relaxed text-muted-foreground border-t border-border/30 pt-4 w-full">
          {suggestion.reason_pt}
        </p>
      </div>
    </div>
  );
}

// ─── SwapRow ─────────────────────────────────────────────────────────────────

interface SwapRowProps {
  suggestion: SwapSuggestion;
  index: number;
}

function SwapRow({ suggestion, index }: SwapRowProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <div
        className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border/30 bg-muted/10 p-4 transition-colors hover:border-border/50 hover:bg-muted/20"
        onClick={() => setLightboxOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setLightboxOpen(true)}
        aria-label={`Ver detalhes: ${suggestion.remove.name} por ${suggestion.add.name}`}
      >
        {/* Índice + hint */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
            Troca {index + 1}
          </span>
          <span className="text-[10px] text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
            clique para ampliar
          </span>
        </div>

        {/* Imagens + seta */}
        <div className="flex items-center gap-3">
          {/* Carta removida */}
          <div className="flex flex-col items-center gap-1.5">
            <CardImage
              code={suggestion.remove.code}
              name={suggestion.remove.name}
            />
            <div className="text-center">
              <p className="text-[10px] font-medium text-rose-400">
                − {suggestion.remove.qty}×
              </p>
              <p className="max-w-[80px] truncate text-[10px] text-muted-foreground">
                {suggestion.remove.name}
              </p>
            </div>
          </div>

          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />

          {/* Carta adicionada */}
          <div className="flex flex-col items-center gap-1.5">
            <CardImage
              code={suggestion.add.code}
              name={suggestion.add.name}
            />
            <div className="text-center">
              <p className="text-[10px] font-medium text-emerald-400">
                + {suggestion.add.qty}×
              </p>
              <p className="max-w-[80px] truncate text-[10px] text-muted-foreground">
                {suggestion.add.name}
              </p>
            </div>
          </div>

          {/* Justificativa à direita */}
          <p className="flex-1 text-xs leading-relaxed text-muted-foreground/80 pl-1">
            {suggestion.reason_pt}
          </p>
        </div>
      </div>

      {lightboxOpen && (
        <Lightbox suggestion={suggestion} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}

// ─── SuggestionsCard (conteúdo da seção) ────────────────────────────────────

interface SuggestionsCardProps {
  suggestions: SwapSuggestion[];
}

export default function SuggestionsCard({ suggestions }: SuggestionsCardProps) {
  return (
    <div className="flex flex-col gap-3">
      {suggestions.map((s, i) => (
        <SwapRow key={`${s.remove.code}-${s.add.code}`} suggestion={s} index={i} />
      ))}
    </div>
  );
}
