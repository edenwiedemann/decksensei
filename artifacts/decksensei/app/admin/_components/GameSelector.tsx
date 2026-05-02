"use client";

interface Game {
  id: string;
  label: string;
}

const GAMES: Game[] = [
  { id: "digimon", label: "Digimon Card Game" },
];

export default function GameSelector() {
  return (
    <select
      defaultValue="digimon"
      className="rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
    >
      {GAMES.map((g) => (
        <option key={g.id} value={g.id}>
          {g.label}
        </option>
      ))}
    </select>
  );
}
