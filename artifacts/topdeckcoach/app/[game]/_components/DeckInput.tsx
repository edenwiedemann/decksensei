"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getParser } from "@/lib/games";
import type { GameConfig } from "@/lib/game-config";

interface DeckInputProps {
  placeholder: string;
  gameConfig: GameConfig;
}

function sumQty(cards: { quantity: number }[]): number {
  return cards.reduce((acc, c) => acc + c.quantity, 0);
}

export default function DeckInput({ placeholder, gameConfig }: DeckInputProps) {
  const [deck, setDeck] = useState("");

  const parsed = useMemo(() => {
    if (!deck.trim()) return null;
    const parser = getParser(gameConfig.id);
    return parser.parse(deck);
  }, [deck, gameConfig.id]);

  const { main_deck_size, egg_deck_max } = gameConfig.deck_rules;
  const hasEggDeck = egg_deck_max > 0;

  const mainDeckCount = parsed ? sumQty(parsed.mainDeck) : 0;
  const eggDeckCount = parsed ? sumQty(parsed.auxDecks["egg"] ?? []) : 0;
  const totalCards = mainDeckCount + eggDeckCount;
  const hasRecognized = parsed
    ? parsed.mainDeck.length + Object.values(parsed.auxDecks).flat().length > 0
    : false;

  const isReady = parsed !== null && mainDeckCount >= main_deck_size;

  const mainStatus: "ok" | "low" | "high" =
    !parsed || mainDeckCount === 0
      ? "low"
      : mainDeckCount === main_deck_size
        ? "ok"
        : mainDeckCount > main_deck_size
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
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
            {!hasRecognized ? (
              <span className="text-muted-foreground">
                Nenhuma carta reconhecida — verifique o formato
              </span>
            ) : (
              <>
                <Stat label="total" value={totalCards} />
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
                    {mainDeckCount}
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
                        {eggDeckCount}
                      </span>
                    </span>
                  </>
                )}

                {mainStatus === "low" && mainDeckCount > 0 && (
                  <>
                    <Divider />
                    <span className="text-amber-400/80">
                      faltam {main_deck_size - mainDeckCount}
                    </span>
                  </>
                )}

                {mainStatus === "high" && (
                  <>
                    <Divider />
                    <span className="text-amber-400/80">
                      {mainDeckCount - main_deck_size} a mais
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Erros de parsing */}
          {parsed.errors.length > 0 && (
            <ul className="flex flex-col gap-0.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              {parsed.errors.map((err, i) => (
                <li key={i} className="text-xs text-destructive/80">
                  {err}
                </li>
              ))}
            </ul>
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
