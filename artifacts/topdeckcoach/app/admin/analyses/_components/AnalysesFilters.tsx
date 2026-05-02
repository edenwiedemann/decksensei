"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  archetypes: string[];
  games: string[];
}

export default function AnalysesFilters({ archetypes, games }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params?.toString() ?? "");
    if (value && value !== "all") {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function setDate(key: string, value: string) {
    const next = new URLSearchParams(params?.toString() ?? "");
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function clear() {
    startTransition(() => router.replace(pathname ?? "/admin/analyses"));
  }

  const cur = {
    from: params?.get("from") ?? "",
    to: params?.get("to") ?? "",
    feedback: params?.get("feedback") ?? "all",
    archetype: params?.get("archetype") ?? "all",
    auth: params?.get("auth") ?? "all",
    game: params?.get("game") ?? "all",
  };

  const hasFilters = !!(cur.from || cur.to || cur.feedback !== "all" ||
    cur.archetype !== "all" || cur.auth !== "all" || cur.game !== "all");

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          defaultValue={cur.from}
          onChange={(e) => setDate("from", e.target.value)}
          className="h-9 rounded-lg border border-border/60 bg-card/50 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          title="De"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <input
          type="date"
          defaultValue={cur.to}
          onChange={(e) => setDate("to", e.target.value)}
          className="h-9 rounded-lg border border-border/60 bg-card/50 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          title="Até"
        />
      </div>

      <Select
        value={cur.feedback}
        onChange={(v) => set("feedback", v)}
        options={[
          { value: "all", label: "Feedback: todos" },
          { value: "up", label: "👍 positivo" },
          { value: "down", label: "👎 negativo" },
          { value: "none", label: "— sem feedback" },
        ]}
      />

      {games.length > 0 && (
        <Select
          value={cur.game}
          onChange={(v) => set("game", v)}
          options={[
            { value: "all", label: "Jogo: todos" },
            ...games.map((g) => ({ value: g, label: g })),
          ]}
        />
      )}

      {archetypes.length > 0 && (
        <Select
          value={cur.archetype}
          onChange={(v) => set("archetype", v)}
          options={[
            { value: "all", label: "Arquetipo: todos" },
            ...archetypes.map((a) => ({ value: a, label: a })),
          ]}
        />
      )}

      <Select
        value={cur.auth}
        onChange={(v) => set("auth", v)}
        options={[
          { value: "all", label: "Todas" },
          { value: "logged", label: "Só logadas" },
        ]}
      />

      {hasFilters && (
        <button
          onClick={clear}
          className="h-9 rounded-lg border border-border/40 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-border/60 bg-card/50 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
