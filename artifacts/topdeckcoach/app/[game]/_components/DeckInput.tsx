"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface DeckInputProps {
  placeholder: string;
}

export default function DeckInput({ placeholder }: DeckInputProps) {
  const [deck, setDeck] = useState("");
  const isEmpty = deck.trim().length === 0;

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button size="lg" disabled={isEmpty} className="w-full sm:w-auto">
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
