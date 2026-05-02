/** Tipos usados no editor de arquetipos (admin meta). */

export interface FormKeyCard {
  code: string;
  name: string;
  qty: number;
  role: string;
  note_pt: string;
  imageUrl?: string | null;
}

export interface FormDeckCard {
  code: string;
  name: string;
  qty: number;
  imageUrl?: string | null;
}

export interface FormMatchup {
  vs: string;
  win_rate_pct: number;
}

export interface FormArchetype {
  id: string;
  name: string;
  name_pt: string;
  colors: string[];
  play_style: string;
  play_style_pt: string;
  tier: "S" | "A" | "B" | "C";
  meta_share_pct: number;
  win_rate_pct: number;
  record: string;
  key_cards: FormKeyCard[];
  matchups: FormMatchup[];
  example_decklist: {
    source: string;
    main: FormDeckCard[];
    egg: FormDeckCard[];
  };
  coach_notes_pt: string;
}

export interface CardSearchResult {
  code: string;
  name: string;
  imageUrl: string | null;
  type: string | null;
  color: string | null;
}

/** Converte o formato do DB → FormArchetype para o editor. */
export function toFormArchetype(db: Record<string, unknown>): FormArchetype {
  const good = (db.good_matchups as Array<{ vs: string; win_rate_pct: number }>) ?? [];
  const bad  = (db.bad_matchups  as Array<{ vs: string; win_rate_pct: number }>) ?? [];
  const combined: FormMatchup[] = [
    ...good.map((m) => ({ vs: m.vs, win_rate_pct: m.win_rate_pct })),
    ...bad.map((m)  => ({ vs: m.vs, win_rate_pct: m.win_rate_pct })),
  ];

  const rawDecklist = (db.example_decklist as Record<string, unknown> | null) ?? {};
  const rawMain = (rawDecklist.main as Array<{ qty: number; code: string; name: string }>) ?? [];
  const rawEgg  = (rawDecklist.egg  as Array<{ qty: number; code: string; name: string }>) ?? [];
  const rawKeys = (db.key_cards as Array<{ code: string; name: string; role?: string; note_pt?: string; qty?: number }>) ?? [];

  return {
    id:              (db.id as string)              ?? `arch-${Date.now()}`,
    name:            (db.name as string)            ?? "",
    name_pt:         (db.name_pt as string)         ?? "",
    colors:          (db.colors as string[])        ?? [],
    play_style:      (db.play_style as string)      ?? "midrange",
    play_style_pt:   (db.play_style_pt as string)   ?? "",
    tier:            ((db.tier as "S"|"A"|"B"|"C")) ?? "B",
    meta_share_pct:  (db.meta_share_pct as number)  ?? 0,
    win_rate_pct:    (db.win_rate_pct as number)    ?? 50,
    record:          (db.record as string)          ?? "",
    coach_notes_pt:  (db.coach_notes_pt as string)  ?? "",
    key_cards: rawKeys.map((kc) => ({
      code:     kc.code    ?? "",
      name:     kc.name    ?? "",
      qty:      kc.qty     ?? 1,
      role:     kc.role    ?? "engine",
      note_pt:  kc.note_pt ?? "",
    })),
    matchups: combined,
    example_decklist: {
      source: (rawDecklist.source as string) ?? "",
      main:   rawMain.map((c) => ({ qty: c.qty ?? 1, code: c.code ?? "", name: c.name ?? "" })),
      egg:    rawEgg.map((c)  => ({ qty: c.qty ?? 1, code: c.code ?? "", name: c.name ?? "" })),
    },
  };
}

/** Converte FormArchetype → objeto DB (MetaArchetype shape). */
export function toDbArchetype(fa: FormArchetype): Record<string, unknown> {
  return {
    id:             fa.id,
    name:           fa.name,
    name_pt:        fa.name_pt,
    colors:         fa.colors,
    play_style:     fa.play_style,
    play_style_pt:  fa.play_style_pt,
    tier:           fa.tier,
    meta_share_pct: fa.meta_share_pct,
    win_rate_pct:   fa.win_rate_pct,
    record:         fa.record,
    coach_notes_pt: fa.coach_notes_pt,
    key_cards: fa.key_cards.map((kc) => ({
      code:    kc.code,
      name:    kc.name,
      qty:     kc.qty,
      role:    kc.role,
      note_pt: kc.note_pt || undefined,
    })),
    good_matchups: fa.matchups.filter((m) => m.win_rate_pct >= 50).map((m) => ({
      vs: m.vs, win_rate_pct: m.win_rate_pct,
    })),
    bad_matchups: fa.matchups.filter((m) => m.win_rate_pct < 50).map((m) => ({
      vs: m.vs, win_rate_pct: m.win_rate_pct,
    })),
    example_decklist: {
      source: fa.example_decklist.source,
      main:   fa.example_decklist.main.map((c) => ({ qty: c.qty, code: c.code, name: c.name })),
      egg:    fa.example_decklist.egg.map((c)  => ({ qty: c.qty, code: c.code, name: c.name })),
    },
  };
}

export const BLANK_ARCHETYPE: FormArchetype = {
  id:             `arch-${Date.now()}`,
  name:           "Novo Arquetipo",
  name_pt:        "",
  colors:         [],
  play_style:     "midrange",
  play_style_pt:  "",
  tier:           "B",
  meta_share_pct: 0,
  win_rate_pct:   50,
  record:         "",
  key_cards:      [],
  matchups:       [],
  example_decklist: { source: "", main: [], egg: [] },
  coach_notes_pt: "",
};
