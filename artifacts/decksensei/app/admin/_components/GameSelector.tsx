"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Props {
  games: Array<{ id: string; label: string }>;
  current: string;
}

export default function GameSelector({ games, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  return (
    <select
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams(sp.toString());
        params.set("game", e.target.value);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
    >
      {games.map((g) => (
        <option key={g.id} value={g.id}>
          {g.label}
        </option>
      ))}
    </select>
  );
}
