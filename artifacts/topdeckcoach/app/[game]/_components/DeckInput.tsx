"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type GameConfig, parseDeckList } from "@/lib/game-config";

interface DeckInputProps {
  placeholder: string;
  gameConfig: GameConfig;
}

export default function DeckInput({ placeholder, gameConfig }: DeckInputProps) {
  const [deck, setDeck] = useState("");

  const parsed = useMemo(() => {
    if (!deck.trim()) return null;
    return parseDeckList(deck, gameConfig);
  }, [deck, gameConfig]);

  const { main_deck_size, egg_deck_max } = gameConfig.deck_rules;
  const hasEggDeck = egg_deck_max > 0;

  const isReady =
    parsed !== null && parsed.mainDeckCount >= main_deck_size;

  const mainStatus: "ok" | "low" | "high" =
    parsed === null
      ? "low"
      : parsed.mainDeckCount === main_deck_size
        ? "ok"
        : parsed.mainDeckCount > main_deck_size
          ? "high"
          : "low";

  return (
    <div className="flex flex-col gap-4">
      <Textarea
        value={deck}
        onChange={(e) => setDeck(e.target.value)}
        placeholder={placeholder}
        rows={12}
        className="font-mono text-sm leading-relaxed"
        aria-label="Decklist"
      />

      {/* Deck parse preview */}
      {parsed !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
          {parsed.linesRecognized === 0 ? (
            <span className="text-muted-foreground">
              Nenhuma carta reconhecida — verifique o formato
            </span>
          ) : (
            <>
              <Stat label="total" value={parsed.totalCards} />
              <Divider />
              <span
                className={
                  mainStatus === "ok"
                    ? "text-green-400"
                    : mainStatus === "high"
                      ? "text-amber-400"
                      : "text-muted-foreground"
                }
              >
                main deck:{" "}
                <span className="font-semibold tabular-nums">
                  {parsed.mainDeckCount}
                </span>
                <span className="text-muted-foreground/60">
                  /{main_deck_size}
                </span>
              </span>

              {hasEggDeck && (
                <>
                  <Divider />
                  <span className="text-muted-foreground">
                    egg deck:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {parsed.eggDeckCount}
                    </span>
                  </span>
                </>
              )}

              {mainStatus === "low" && parsed.mainDeckCount > 0 && (
                <>
                  <Divider />
                  <span className="text-amber-400/80">
                    faltam {main_deck_size - parsed.mainDeckCount}
                  </span>
                </>
              )}

              {mainStatus === "high" && (
                <>
                  <Divider />
                  <span className="text-amber-400/80">
                    {parsed.mainDeckCount - main_deck_size} a mais
                  </span>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button size="lg" disabled={!isReady} className="w-full sm:w-auto">
          Analisar deck
        </Button>

        <a
          href="#exemplo"
          className="text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 sm:text-right"
        >
          ver análise de exemplo
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-muted-foreground">
      {label}:{" "}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function Divider() {
  return <span className="text-border">·</span>;
}
