"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormArchetype, FormKeyCard, FormDeckCard, FormMatchup, CardSearchResult } from "@/app/admin/meta/_lib/types";
import CardSearch from "./CardSearch";

// ─── Constantes ──────────────────────────────────────────────────────────────

const COLORS = [
  { id: "red",    label: "Vermelho", tw: "bg-red-500" },
  { id: "blue",   label: "Azul",    tw: "bg-blue-500" },
  { id: "yellow", label: "Amarelo", tw: "bg-yellow-400" },
  { id: "green",  label: "Verde",   tw: "bg-green-500" },
  { id: "black",  label: "Preto",   tw: "bg-zinc-800 border border-zinc-500" },
  { id: "purple", label: "Roxo",    tw: "bg-purple-500" },
  { id: "white",  label: "Branco",  tw: "bg-white" },
];

const PLAY_STYLES = [
  { id: "aggro",           label: "Aggro" },
  { id: "midrange",        label: "Midrange" },
  { id: "control",         label: "Control" },
  { id: "combo",           label: "Combo" },
  { id: "toolbox",         label: "Toolbox" },
  { id: "midrange-toolbox",label: "Midrange-Toolbox" },
  { id: "aggro-combo",     label: "Aggro-Combo" },
  { id: "tempo",           label: "Tempo" },
  { id: "burn",            label: "Burn" },
];

const KEY_CARD_ROLES = [
  { id: "engine",   label: "Engine" },
  { id: "finisher", label: "Finisher" },
  { id: "tempo",    label: "Tempo" },
  { id: "control",  label: "Control" },
  { id: "removal",  label: "Removal" },
  { id: "tamer",    label: "Tamer" },
  { id: "option",   label: "Option" },
  { id: "egg",      label: "Ovo (egg)" },
];

const DECK_QTY_OPTIONS = [1, 2, 3, 4];
const MAIN_DECK_SIZE = 50;
const EGG_MAX = 5;

// ─── Sortable key card item ───────────────────────────────────────────────────

function SortableKeyCard({
  card,
  index,
  onChange,
  onRemove,
}: {
  card: FormKeyCard & { uid: string };
  index: number;
  onChange: (idx: number, field: keyof FormKeyCard, val: string | number) => void;
  onRemove: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.uid });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-start gap-2 rounded-lg border border-border/30 bg-background/30 p-3"
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-1 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="Arrastar para reordenar"
      >
        ⠿
      </button>

      {/* Thumbnail */}
      {card.imageUrl ? (
        <img src={card.imageUrl} alt={card.name} className="h-12 w-8 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-card/60 text-[10px] text-muted-foreground/30">?</div>
      )}

      <div className="flex flex-1 flex-wrap items-start gap-2">
        {/* Code + Name */}
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground/60">{card.code}</span>
            <span className="text-sm font-medium text-foreground">{card.name}</span>
          </div>
          <Input
            value={card.note_pt}
            onChange={(e) => onChange(index, "note_pt", e.target.value)}
            placeholder="Nota em PT (opcional)"
            className="h-7 text-xs"
          />
        </div>

        {/* Qty */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Qtd</span>
          <select
            value={card.qty}
            onChange={(e) => onChange(index, "qty", parseInt(e.target.value, 10))}
            className="h-7 rounded-md border border-border/40 bg-background/60 px-2 text-xs text-foreground"
          >
            {DECK_QTY_OPTIONS.map((q) => (
              <option key={q} value={q}>{q}×</option>
            ))}
          </select>
        </div>

        {/* Role */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Função</span>
          <select
            value={card.role}
            onChange={(e) => onChange(index, "role", e.target.value)}
            className="h-7 rounded-md border border-border/40 bg-background/60 px-2 text-xs text-foreground"
          >
            {KEY_CARD_ROLES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mt-1 rounded-md px-1.5 py-0.5 text-xs text-red-400/50 hover:text-red-400"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Deck card row ────────────────────────────────────────────────────────────

function DeckCardRow({
  card,
  index,
  onChange,
  onRemove,
  maxQty = 4,
}: {
  card: FormDeckCard & { uid: string };
  index: number;
  onChange: (idx: number, qty: number) => void;
  onRemove: (idx: number) => void;
  maxQty?: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/20 bg-background/20 px-3 py-1.5">
      {card.imageUrl ? (
        <img src={card.imageUrl} alt={card.name} className="h-8 w-6 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-8 w-6 shrink-0 rounded bg-card/40 text-[8px] flex items-center justify-center text-muted-foreground/30">?</div>
      )}
      <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0">{card.code}</span>
      <span className="flex-1 truncate text-sm text-foreground">{card.name}</span>
      <select
        value={card.qty}
        onChange={(e) => onChange(index, parseInt(e.target.value, 10))}
        className="h-6 rounded border border-border/40 bg-background/60 px-1 text-xs text-foreground"
      >
        {Array.from({ length: maxQty }, (_, i) => i + 1).map((q) => (
          <option key={q} value={q}>{q}×</option>
        ))}
      </select>
      <button type="button" onClick={() => onRemove(index)} className="text-xs text-red-400/40 hover:text-red-400">✕</button>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</h2>
      {children}
    </div>
  );
}

// ─── Uid helpers ─────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => `uid-${++_uid}`;

function withUid<T extends object>(arr: T[]): (T & { uid: string })[] {
  return arr.map((x) => ({ ...x, uid: uid() }));
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface Props {
  snapshotId: number;
  archIdx: number;
  initialData: FormArchetype;
  otherArchetypes: Array<{ id: string; name: string }>;
  gameId: string;
}

export default function ArchetypeEditForm({ snapshotId, archIdx, initialData, otherArchetypes }: Props) {
  const router = useRouter();

  // Basic fields
  const [name, setName]           = useState(initialData.name);
  const [namePt, setNamePt]       = useState(initialData.name_pt);
  const [tier, setTier]           = useState<"S"|"A"|"B"|"C">(initialData.tier);
  const [wr, setWr]               = useState(String(initialData.win_rate_pct));
  const [share, setShare]         = useState(String(initialData.meta_share_pct));
  const [record, setRecord]       = useState(initialData.record);
  const [colors, setColors]       = useState<string[]>(initialData.colors);
  const [playStyle, setPlayStyle] = useState(initialData.play_style || "midrange");
  const [playStylePt, setPlayStylePt] = useState(initialData.play_style_pt);
  const [coachNotes, setCoachNotes]   = useState(initialData.coach_notes_pt);

  // Key cards
  const [keyCards, setKeyCards] = useState<(FormKeyCard & { uid: string })[]>(
    withUid(initialData.key_cards),
  );

  // Decklist
  const [mainDeck, setMainDeck] = useState<(FormDeckCard & { uid: string })[]>(
    withUid(initialData.example_decklist.main),
  );
  const [eggDeck, setEggDeck] = useState<(FormDeckCard & { uid: string })[]>(
    withUid(initialData.example_decklist.egg),
  );

  // Matchups
  const [matchups, setMatchups] = useState<FormMatchup[]>(initialData.matchups);
  const [matchupVs, setMatchupVs]   = useState("");
  const [matchupWr, setMatchupWr]   = useState("50");

  // Save state
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");

  // DnD sensors for key cards
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Computed ─────────────────────────────────────────────────────────────

  const mainTotal = mainDeck.reduce((s, c) => s + c.qty, 0);
  const eggTotal  = eggDeck.reduce((s, c) => s + c.qty, 0);
  const mainValid = mainTotal === MAIN_DECK_SIZE;
  const eggValid  = eggTotal <= EGG_MAX;

  // ── Colors toggle ─────────────────────────────────────────────────────────

  const toggleColor = (c: string) => {
    setColors((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  };

  // ── Key cards ─────────────────────────────────────────────────────────────

  const addKeyCard = useCallback((card: CardSearchResult) => {
    setKeyCards((prev) => [
      ...prev,
      { uid: uid(), code: card.code, name: card.name, qty: 1, role: "engine", note_pt: "", imageUrl: card.imageUrl },
    ]);
  }, []);

  const updateKeyCard = useCallback((idx: number, field: keyof FormKeyCard, val: string | number) => {
    setKeyCards((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));
  }, []);

  const removeKeyCard = useCallback((idx: number) => {
    setKeyCards((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleKeyCardDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setKeyCards((prev) => {
        const oldIdx = prev.findIndex((c) => c.uid === active.id);
        const newIdx = prev.findIndex((c) => c.uid === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  // ── Main deck ─────────────────────────────────────────────────────────────

  const addToMainDeck = useCallback((card: CardSearchResult) => {
    setMainDeck((prev) => {
      const existing = prev.find((c) => c.code === card.code);
      if (existing) {
        return prev.map((c) => c.code === card.code ? { ...c, qty: Math.min(4, c.qty + 1) } : c);
      }
      return [...prev, { uid: uid(), code: card.code, name: card.name, qty: 1, imageUrl: card.imageUrl }];
    });
  }, []);

  const updateMainCard = (idx: number, qty: number) => {
    setMainDeck((prev) => prev.map((c, i) => i === idx ? { ...c, qty } : c));
  };

  const removeMainCard = (idx: number) => {
    setMainDeck((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Egg deck ──────────────────────────────────────────────────────────────

  const addToEggDeck = useCallback((card: CardSearchResult) => {
    setEggDeck((prev) => {
      const existing = prev.find((c) => c.code === card.code);
      if (existing) {
        return prev.map((c) => c.code === card.code ? { ...c, qty: Math.min(4, c.qty + 1) } : c);
      }
      return [...prev, { uid: uid(), code: card.code, name: card.name, qty: 1, imageUrl: card.imageUrl }];
    });
  }, []);

  const updateEggCard = (idx: number, qty: number) => {
    setEggDeck((prev) => prev.map((c, i) => i === idx ? { ...c, qty } : c));
  };

  const removeEggCard = (idx: number) => {
    setEggDeck((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Matchups ──────────────────────────────────────────────────────────────

  const addMatchup = () => {
    const vs = matchupVs.trim();
    const wrNum = parseFloat(matchupWr);
    if (!vs || isNaN(wrNum)) return;
    if (matchups.some((m) => m.vs === vs)) return;
    setMatchups((prev) => [...prev, { vs, win_rate_pct: wrNum }]);
    setMatchupVs("");
    setMatchupWr("50");
  };

  const removeMatchup = (vs: string) => {
    setMatchups((prev) => prev.filter((m) => m.vs !== vs));
  };

  const updateMatchupWr = (vs: string, newWr: string) => {
    setMatchups((prev) => prev.map((m) => m.vs === vs ? { ...m, win_rate_pct: parseFloat(newWr) || 0 } : m));
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveError("");
    const errors: string[] = [];
    if (!name.trim()) errors.push("Nome (EN) é obrigatório.");
    const wrNum = parseFloat(wr);
    const shareNum = parseFloat(share);
    if (isNaN(wrNum) || wrNum < 0 || wrNum > 100) errors.push("Win rate deve ser um número entre 0 e 100.");
    if (isNaN(shareNum) || shareNum < 0 || shareNum > 100) errors.push("Meta share deve ser um número entre 0 e 100.");
    if (errors.length > 0) { setSaveError(errors.join(" ")); return; }

    const payload: FormArchetype = {
      id:             initialData.id,
      name:           name.trim(),
      name_pt:        namePt.trim(),
      tier,
      win_rate_pct:   wrNum,
      meta_share_pct: shareNum,
      record:         record.trim(),
      colors,
      play_style:     playStyle,
      play_style_pt:  playStylePt.trim(),
      coach_notes_pt: coachNotes.trim(),
      key_cards:      keyCards.map(({ uid: _uid, ...c }) => c),
      matchups,
      example_decklist: {
        source: "",
        main:   mainDeck.map(({ uid: _uid, ...c }) => c),
        egg:    eggDeck.map(({ uid: _uid, ...c }) => c),
      },
    };

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/meta/snapshots/${snapshotId}/archetypes/${archIdx}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSaveError(data.error ?? `Erro HTTP ${res.status}`);
      } else {
        router.push(`/admin/meta/${snapshotId}`);
      }
    } catch {
      setSaveError("Erro de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const goodMatchups = matchups.filter((m) => m.win_rate_pct >= 50);
  const badMatchups  = matchups.filter((m) => m.win_rate_pct < 50);

  return (
    <div className="space-y-6">

      {/* ── 1. Informações básicas ─────────────────────────────────────── */}
      <Section title="Informações básicas">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nome (EN) <span className="text-red-400">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Red Hybrid" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nome PT-BR</Label>
            <Input value={namePt} onChange={(e) => setNamePt(e.target.value)} placeholder="Híbrido Vermelho" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tier</Label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as "S"|"A"|"B"|"C")}
              className="h-9 w-full rounded-md border border-border/40 bg-background/60 px-3 text-sm text-foreground"
            >
              {["S","A","B","C"].map((t) => <option key={t} value={t}>Tier {t}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Recorde (ex: 25-10)</Label>
            <Input value={record} onChange={(e) => setRecord(e.target.value)} placeholder="25-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Win rate %</Label>
            <Input
              type="number" min={0} max={100} step={0.1}
              value={wr} onChange={(e) => setWr(e.target.value)}
              placeholder="52.5"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Meta share %</Label>
            <Input
              type="number" min={0} max={100} step={0.1}
              value={share} onChange={(e) => setShare(e.target.value)}
              placeholder="15.0"
            />
          </div>
        </div>
      </Section>

      {/* ── 2. Cores ──────────────────────────────────────────────────── */}
      <Section title="Cores do arquetipo">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleColor(c.id)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                colors.includes(c.id)
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border/40 bg-background/30 text-muted-foreground hover:border-border/70"
              }`}
            >
              <span className={`h-3 w-3 rounded-full ${c.tw}`} />
              {c.label}
            </button>
          ))}
        </div>
        {colors.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground/50">Selecione ao menos uma cor.</p>
        )}
      </Section>

      {/* ── 3. Estilo de jogo ─────────────────────────────────────────── */}
      <Section title="Estilo de jogo">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Estilo</Label>
            <select
              value={playStyle}
              onChange={(e) => setPlayStyle(e.target.value)}
              className="h-9 w-full rounded-md border border-border/40 bg-background/60 px-3 text-sm text-foreground"
            >
              {PLAY_STYLES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Descrição do estilo em PT-BR</Label>
            <textarea
              value={playStylePt}
              onChange={(e) => setPlayStylePt(e.target.value)}
              rows={3}
              placeholder="Arquetipo agressivo que pressiona o oponente com Digimons baratos…"
              className="w-full rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/60 focus:outline-none resize-none"
            />
          </div>
        </div>
      </Section>

      {/* ── 4. Notas do coach ─────────────────────────────────────────── */}
      <Section title="Notas do coach (em PT-BR)">
        <textarea
          value={coachNotes}
          onChange={(e) => setCoachNotes(e.target.value)}
          rows={6}
          placeholder="Pontos fortes, fraquezas, dicas de como jogar, erros comuns, como abordar o matchup…"
          className="w-full rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/60 focus:outline-none resize-none"
        />
      </Section>

      {/* ── 5. Cartas-chave ───────────────────────────────────────────── */}
      <Section title="Cartas-chave">
        <div className="space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleKeyCardDragEnd}
          >
            <SortableContext items={keyCards.map((c) => c.uid)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {keyCards.map((card, idx) => (
                  <SortableKeyCard
                    key={card.uid}
                    card={card}
                    index={idx}
                    onChange={updateKeyCard}
                    onRemove={removeKeyCard}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {keyCards.length === 0 && (
            <p className="text-xs text-muted-foreground/40 italic">Nenhuma carta-chave ainda. Use a busca abaixo para adicionar.</p>
          )}

          <div className="pt-1">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">+ Adicionar carta-chave</p>
            <CardSearch onAdd={addKeyCard} />
          </div>
        </div>
      </Section>

      {/* ── 6. Decklist exemplar ─────────────────────────────────────── */}
      <Section title="Decklist exemplar — Main Deck">
        <div className="space-y-3">
          {/* Counter / validation */}
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            mainValid
              ? "border border-emerald-500/30 bg-emerald-950/20 text-emerald-400"
              : "border border-red-500/30 bg-red-950/20 text-red-400"
          }`}>
            {mainValid
              ? `✓ ${mainTotal} cartas — deck válido`
              : `⚠ ${mainTotal} de ${MAIN_DECK_SIZE} cartas — ${mainTotal < MAIN_DECK_SIZE ? `faltam ${MAIN_DECK_SIZE - mainTotal}` : `excede em ${mainTotal - MAIN_DECK_SIZE}`}`}
          </div>

          <div className="space-y-1">
            {mainDeck.map((card, idx) => (
              <DeckCardRow key={card.uid} card={card} index={idx} onChange={updateMainCard} onRemove={removeMainCard} />
            ))}
          </div>

          <div className="pt-1">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">+ Adicionar carta ao main deck</p>
            <CardSearch onAdd={addToMainDeck} placeholder="Buscar carta para o main deck…" />
          </div>
        </div>
      </Section>

      <Section title="Decklist exemplar — Egg Deck">
        <div className="space-y-3">
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            eggValid
              ? "border border-emerald-500/30 bg-emerald-950/20 text-emerald-400"
              : "border border-red-500/30 bg-red-950/20 text-red-400"
          }`}>
            {eggValid
              ? `✓ ${eggTotal} de até ${EGG_MAX} ovos — válido`
              : `⚠ ${eggTotal} ovos — máximo é ${EGG_MAX}`}
          </div>

          <div className="space-y-1">
            {eggDeck.map((card, idx) => (
              <DeckCardRow key={card.uid} card={card} index={idx} onChange={updateEggCard} onRemove={removeEggCard} maxQty={5} />
            ))}
          </div>

          <div className="pt-1">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">+ Adicionar ovo ao egg deck</p>
            <CardSearch onAdd={addToEggDeck} placeholder="Buscar ovo para o egg deck…" />
          </div>
        </div>
      </Section>

      {/* ── 7. Matchups ──────────────────────────────────────────────── */}
      <Section title="Matchups">
        {/* Good matchups */}
        {goodMatchups.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-emerald-400/70">Matchups favoráveis (WR ≥ 50%)</p>
            <div className="space-y-1.5">
              {goodMatchups.map((m) => (
                <MatchupRow key={m.vs} matchup={m} onRemove={removeMatchup} onWrChange={updateMatchupWr} />
              ))}
            </div>
          </div>
        )}

        {/* Bad matchups */}
        {badMatchups.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-red-400/70">Matchups desfavoráveis (WR &lt; 50%)</p>
            <div className="space-y-1.5">
              {badMatchups.map((m) => (
                <MatchupRow key={m.vs} matchup={m} onRemove={removeMatchup} onWrChange={updateMatchupWr} />
              ))}
            </div>
          </div>
        )}

        {matchups.length === 0 && (
          <p className="mb-4 text-xs text-muted-foreground/40 italic">Nenhum matchup adicionado ainda.</p>
        )}

        {/* Add matchup row */}
        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/30">
          <div className="flex flex-1 min-w-[200px] flex-col gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Oponente</Label>
            <div className="relative">
              {otherArchetypes.length > 0 ? (
                <select
                  value={matchupVs}
                  onChange={(e) => setMatchupVs(e.target.value)}
                  className="h-8 w-full rounded-md border border-border/40 bg-background/60 px-2 text-sm text-foreground"
                >
                  <option value="">Selecionar arquetipo…</option>
                  {otherArchetypes.map((a) => (
                    <option key={a.id} value={a.name}>{a.name}</option>
                  ))}
                </select>
              ) : (
                <Input
                  value={matchupVs}
                  onChange={(e) => setMatchupVs(e.target.value)}
                  placeholder="Nome do arquetipo"
                  className="h-8 text-sm"
                />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 w-24">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/50">WR %</Label>
            <Input
              type="number" min={0} max={100}
              value={matchupWr}
              onChange={(e) => setMatchupWr(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addMatchup} className="h-8">
            + Adicionar
          </Button>
        </div>
      </Section>

      {/* ── Save / Error ─────────────────────────────────────────────── */}
      {saveError && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {saveError}
        </div>
      )}

      <div className="flex items-center gap-3 pb-8">
        <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground px-8">
          {saving ? "Salvando…" : "✓ Salvar arquetipo"}
        </Button>
        <Button variant="outline" onClick={() => router.push(`/admin/meta/${snapshotId}`)}>
          Cancelar
        </Button>
      </div>

    </div>
  );
}

// ─── Matchup row ──────────────────────────────────────────────────────────────

function MatchupRow({
  matchup,
  onRemove,
  onWrChange,
}: {
  matchup: FormMatchup;
  onRemove: (vs: string) => void;
  onWrChange: (vs: string, wr: string) => void;
}) {
  const isFav = matchup.win_rate_pct >= 50;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/30 bg-background/20 px-3 py-2">
      <span className={`text-[10px] font-bold ${isFav ? "text-emerald-400" : "text-red-400"}`}>
        {isFav ? "▲" : "▼"}
      </span>
      <span className="flex-1 text-sm text-foreground">{matchup.vs}</span>
      <input
        type="number"
        min={0}
        max={100}
        value={matchup.win_rate_pct}
        onChange={(e) => onWrChange(matchup.vs, e.target.value)}
        className="w-16 rounded border border-border/40 bg-background/60 px-2 py-0.5 text-center text-sm text-foreground focus:outline-none"
      />
      <span className="text-xs text-muted-foreground/50">%</span>
      <button type="button" onClick={() => onRemove(matchup.vs)} className="text-xs text-red-400/40 hover:text-red-400">✕</button>
    </div>
  );
}
