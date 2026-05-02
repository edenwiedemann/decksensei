"use client";

import { useState } from "react";
import type { EnrichedCard, EnrichedDeck } from "@/lib/games/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DeckPreviewProps {
  deck: EnrichedDeck;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalQty(cards: EnrichedCard[]): number {
  return cards.reduce((acc, c) => acc + c.quantity, 0);
}

// ─── Card tile ────────────────────────────────────────────────────────────────

function CardTile({ card }: { card: EnrichedCard }) {
  const [imgError, setImgError] = useState(false);
  const { data } = card;

  const imgSrc = !imgError && data?.imageUrl ? data.imageUrl : null;
  const name = data?.name ?? card.cardName ?? card.cardCode;
  const tooltipText = data?.mainEffect ?? data?.inheritedEffect;

  return (
    <div className="group relative flex flex-col gap-1">
      {/* ── Card image ── */}
      <div className="relative aspect-[5/7] overflow-hidden rounded-md border border-border/40 bg-muted/40">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
          />
        ) : (
          /* Placeholder quando imagem indisponível */
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 select-none">
            <svg
              className="size-5 shrink-0 text-muted-foreground/30"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span className="break-all text-center font-mono text-[9px] leading-tight text-muted-foreground/50">
              {card.cardCode}
            </span>
          </div>
        )}

        {/* ── Quantity badge ── */}
        <span className="absolute right-1 bottom-1 min-w-[1.25rem] rounded bg-black/80 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white tabular-nums ring-1 ring-white/10">
          ×{card.quantity}
        </span>
      </div>

      {/* ── Card name ── */}
      <p className="line-clamp-1 text-center text-[11px] leading-tight text-muted-foreground">
        {name}
      </p>

      {/* ── Tooltip com efeito ── */}
      {tooltipText && (
        <div
          role="tooltip"
          className={[
            "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2.5 w-60",
            "-translate-x-1/2 rounded-xl border border-border/60 bg-popover",
            "px-3.5 py-3 shadow-2xl",
            "opacity-0 scale-95 transition-all duration-150",
            "group-hover:opacity-100 group-hover:scale-100",
          ].join(" ")}
        >
          {/* Arrow pointing down */}
          <span
            aria-hidden
            className="absolute top-full left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[6px] border-t-border/60"
          />
          <span
            aria-hidden
            className="absolute top-full left-1/2 -mt-px -translate-x-1/2 border-x-[5px] border-x-transparent border-t-[5px] border-t-popover"
          />

          <p className="mb-1.5 text-xs font-semibold text-foreground">{name}</p>
          <p className="line-clamp-6 text-[11px] leading-relaxed text-muted-foreground">
            {tooltipText}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Deck section ─────────────────────────────────────────────────────────────

interface DeckSectionProps {
  title: string;
  count: number;
  cards: EnrichedCard[];
}

function DeckSection({ title, count, cards }: DeckSectionProps) {
  return (
    <section aria-label={title}>
      {/* Section header */}
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {count} carta{count !== 1 ? "s" : ""}
        </span>
        <div className="h-px flex-1 bg-border/40" />
      </div>

      {/* Responsive grid: 3 mobile → 4 tablet → 8 desktop */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {cards.map((card) => (
          <CardTile key={card.cardCode} card={card} />
        ))}
      </div>
    </section>
  );
}

// ─── DeckPreview ──────────────────────────────────────────────────────────────

export default function DeckPreview({ deck }: DeckPreviewProps) {
  const eggDeck = deck.auxDecks["egg"] ?? [];
  const hasEgg = eggDeck.length > 0;

  return (
    <div className="flex flex-col gap-10">
      <DeckSection
        title="Main Deck"
        count={totalQty(deck.mainDeck)}
        cards={deck.mainDeck}
      />
      {hasEgg && (
        <DeckSection
          title="Egg Deck"
          count={totalQty(eggDeck)}
          cards={eggDeck}
        />
      )}
    </div>
  );
}
