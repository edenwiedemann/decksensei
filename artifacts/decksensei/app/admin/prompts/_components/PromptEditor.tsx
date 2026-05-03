"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import type { PromptVariables } from "@/lib/analysis-prompt";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import TestModal from "./TestModal";

interface Props {
  gameId: string;
  promptId?: number;
  initialContent?: string;
  initialVersion?: string;
  initialNotes?: string;
  suggestedVersion: string;
  isCurrentlyActive?: boolean;
  realVariables: PromptVariables;
}

const VARIABLES: Array<{ key: keyof PromptVariables; label: string; description: string }> = [
  {
    key: "game_name",
    label: "Nome do jogo",
    description: "Nome completo do jogo da configuração ativa",
  },
  {
    key: "game_card_code_pattern",
    label: "Padrão de código de carta",
    description: "Formato padrão dos códigos de carta do jogo",
  },
  {
    key: "game_card_code_examples",
    label: "Exemplos de códigos",
    description: "Lista de exemplos reais de códigos de cartas",
  },
  {
    key: "game_deck_rules",
    label: "Regras do deck",
    description: "Regras de construção de deck do jogo",
  },
  {
    key: "archetypes_context",
    label: "Arquetipos do meta",
    description: "Lista completa dos arquetipos da snapshot ativa",
  },
];

type AutocompleteState = {
  open: boolean;
  query: string;
  position: { top: number; left: number };
  selectedIdx: number;
} | null;

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export default function PromptEditor({
  gameId,
  promptId,
  initialContent = "",
  initialVersion = "",
  initialNotes = "",
  suggestedVersion,
  isCurrentlyActive = false,
  realVariables,
}: Props) {
  const router = useRouter();

  const [content, setContent] = useState(initialContent);
  const [version, setVersion] = useState(initialVersion || suggestedVersion);
  const [notes, setNotes] = useState(initialNotes);
  const [varOpen, setVarOpen] = useState(true);
  const [testOpen, setTestOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activateError, setActivateError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const completeVariable = useCallback((variable: (typeof VARIABLES)[number]) => {
    const ta = textareaRef.current;
    if (!ta || !autocomplete) return;
    const cursorPos = ta.selectionStart;
    const textBeforeCursor = content.slice(0, cursorPos);
    const match = textBeforeCursor.match(/\{\{([a-z_]*)$/);
    if (!match) return;

    const startOfTrigger = cursorPos - match[0].length;
    const newContent =
      content.slice(0, startOfTrigger) +
      `{{${variable.key}}}` +
      content.slice(cursorPos);
    setContent(newContent);
    setAutocomplete(null);

    requestAnimationFrame(() => {
      const newPos = startOfTrigger + variable.key.length + 4; // {{ + key + }}
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  }, [content, autocomplete]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/\{\{([a-z_]*)$/);

    if (match) {
      const query = match[1];
      const filtered = VARIABLES.filter((v) => v.key.startsWith(query));
      if (filtered.length > 0) {
        const ta = e.target;
        const rect = ta.getBoundingClientRect();
        setAutocomplete({
          open: true,
          query,
          position: { top: rect.bottom + 4, left: rect.left + 20 },
          selectedIdx: 0,
        });
        return;
      }
    }
    setAutocomplete(null);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!autocomplete?.open) return;
    const filtered = VARIABLES.filter((v) => v.key.startsWith(autocomplete.query));

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAutocomplete({
        ...autocomplete,
        selectedIdx: Math.min(autocomplete.selectedIdx + 1, filtered.length - 1),
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAutocomplete({
        ...autocomplete,
        selectedIdx: Math.max(autocomplete.selectedIdx - 1, 0),
      });
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filtered[autocomplete.selectedIdx]) {
        e.preventDefault();
        completeVariable(filtered[autocomplete.selectedIdx]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAutocomplete(null);
    }
  };

  const handleCopyVariable = async (key: string) => {
    await navigator.clipboard.writeText(`{{${key}}}`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSave = useCallback(async () => {
    setSaveError("");
    if (!version.trim()) { setSaveError("O campo Versão é obrigatório."); return; }
    if (!content.trim()) { setSaveError("O conteúdo do prompt não pode estar vazio."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          version: version.trim(),
          systemContent: content.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; id?: number };
      if (!res.ok || !data.ok) {
        setSaveError(data.error ?? `Erro HTTP ${res.status}`);
      } else {
        router.push(`/admin/prompts/${data.id}/edit`);
      }
    } catch {
      setSaveError("Erro de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }, [gameId, version, content, notes, router]);

  const handleActivate = useCallback(async () => {
    if (!promptId) return;
    setActivateError("");
    setActivating(true);
    try {
      const res = await fetch(`/api/admin/prompts/${promptId}/activate`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setActivateError(data.error ?? `Erro HTTP ${res.status}`);
      } else {
        setActivateOpen(false);
        router.refresh();
      }
    } catch {
      setActivateError("Erro de rede. Tente novamente.");
    } finally {
      setActivating(false);
    }
  }, [promptId, router]);

  const previewContent = useMemo(() => {
    return content
      .replaceAll("{{game_name}}", realVariables.game_name)
      .replaceAll("{{game_card_code_pattern}}", realVariables.game_card_code_pattern)
      .replaceAll("{{game_card_code_examples}}", realVariables.game_card_code_examples)
      .replaceAll("{{game_deck_rules}}", realVariables.game_deck_rules)
      .replaceAll("{{archetypes_context}}", realVariables.archetypes_context);
  }, [content, realVariables]);

  const filteredForDropdown = autocomplete
    ? VARIABLES.filter((v) => v.key.startsWith(autocomplete.query))
    : [];

  return (
    <div className="flex flex-col gap-5">
      {/* ── Campos de cabeçalho ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5 min-w-[140px]">
          <Label htmlFor="prompt-version" className="text-xs text-muted-foreground">
            Versão <span className="text-red-400">*</span>
          </Label>
          <Input
            id="prompt-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder={suggestedVersion}
            className="h-8 w-32 font-mono text-sm"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 min-w-[220px]">
          <Label htmlFor="prompt-notes" className="text-xs text-muted-foreground">
            Nota sobre esta versão
          </Label>
          <Input
            id="prompt-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ex: adicionei instrução de brevidade, ajustei tom"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* ── Layout 2 colunas ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[60%_1fr]">
        {/* ── Coluna esquerda: editor ─ */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Editor de prompt
          </p>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            onBlur={() => setTimeout(() => setAutocomplete(null), 150)}
            placeholder="Cole ou escreva o system prompt aqui. Digite {{ para abrir o autocomplete de variáveis."
            className="h-[520px] w-full resize-none rounded-lg border border-border/40 bg-card/30 p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            spellCheck={false}
          />

          {/* Dropdown de autocomplete */}
          {autocomplete?.open && filteredForDropdown.length > 0 && (
            <div
              className="fixed z-50 rounded-lg border border-border/40 bg-card shadow-xl overflow-hidden min-w-[260px]"
              style={{ top: autocomplete.position.top, left: autocomplete.position.left }}
            >
              {filteredForDropdown.map((v, idx) => (
                <button
                  key={v.key}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    completeVariable(v);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-primary/10 ${
                    idx === autocomplete.selectedIdx ? "bg-primary/15" : ""
                  }`}
                >
                  <div className="font-mono text-xs text-primary">{`{{${v.key}}}`}</div>
                  <div className="text-[10px] text-muted-foreground/70">
                    {v.label} · ex: {truncate(realVariables[v.key], 30)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Coluna direita: variáveis + preview ─ */}
        <div className="flex flex-col gap-3">
          {/* Painel de variáveis colapsável */}
          <div className="rounded-xl border border-border/40 bg-card/40">
            <button
              type="button"
              onClick={() => setVarOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Campos disponíveis
              </span>
              <span
                className="text-xs text-muted-foreground/60 transition-transform duration-200"
                style={{ transform: varOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                ▲
              </span>
            </button>
            {varOpen && (
              <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-2">
                <p className="text-xs text-muted-foreground/60 leading-snug">
                  Digite <code className="rounded bg-card/60 px-1 font-mono text-primary">{"{{ "}</code> no
                  editor para abrir o autocomplete. Ou clique em um campo abaixo para copiar e cole onde quiser.
                  As variáveis viram valores reais quando o coach roda a análise.
                </p>
                <div className="space-y-1.5 mt-3">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => handleCopyVariable(v.key)}
                      className="w-full rounded-lg border border-border/30 bg-background/30 px-3 py-2 text-left transition-all hover:border-primary/50 hover:bg-primary/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <code className="rounded bg-card/60 px-1.5 py-0.5 font-mono text-xs text-primary">
                          {`{{${v.key}}}`}
                        </code>
                        <span className="shrink-0 text-[10px] text-muted-foreground/40">
                          {copiedKey === v.key ? "✓ copiado!" : "click pra copiar"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-foreground">{v.label}</p>
                      <p className="text-[10px] text-muted-foreground/60">ex: {truncate(realVariables[v.key], 40)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preview em tempo real */}
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                Preview em tempo real
              </p>
              <button
                type="button"
                onClick={() => setPreviewFullscreen(true)}
                className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                ⛶ tela cheia
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/40 leading-snug -mt-1">
              Variáveis substituídas pelos valores reais do banco.
            </p>
            <div className="min-h-[200px] max-h-[640px] overflow-y-auto rounded-xl border border-border/40 bg-card/30 p-4">
              {content.trim() ? (
                <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/40 italic">
                  O conteúdo do editor aparece aqui renderizado…
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Barra de ações ──────────────────────────────────────── */}
      {saveError && (
        <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-2.5 text-sm text-red-400">
          {saveError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-primary-foreground"
        >
          {saving ? "Salvando…" : "💾 Salvar como nova versão"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setTestOpen(true)}
          disabled={!content.trim()}
        >
          🔬 Testar com deck salvo
        </Button>
        {promptId && !isCurrentlyActive && (
          <Button
            variant="outline"
            onClick={() => setActivateOpen(true)}
            className="border-emerald-500/40 text-emerald-400 hover:border-emerald-500/70 hover:bg-emerald-950/30"
          >
            ⚡ Ativar esta versão
          </Button>
        )}
        {isCurrentlyActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/20 px-3 py-1 text-xs font-medium text-emerald-400">
            ✓ Esta é a versão ativa
          </span>
        )}
      </div>

      {/* ── Modal de teste ──────────────────────────────────────── */}
      <TestModal
        open={testOpen}
        onOpenChange={setTestOpen}
        gameId={gameId}
        systemContent={content}
      />

      {/* ── Modal de confirmação de ativação ────────────────────── */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent className="max-w-md" aria-describedby="activate-desc">
          <DialogHeader>
            <DialogTitle>Ativar versão "{version}"?</DialogTitle>
            <DialogDescription id="activate-desc" className="text-sm text-muted-foreground">
              A versão atual ativa será desativada. A versão <strong>{version}</strong> passará a ser
              usada em todas as novas análises. Esta ação pode ser revertida ativando outra versão.
            </DialogDescription>
          </DialogHeader>
          {activateError && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-400">
              {activateError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setActivateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleActivate}
              disabled={activating}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {activating ? "Ativando…" : "⚡ Sim, ativar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal preview tela cheia ─────────────────────────────── */}
      <Dialog open={previewFullscreen} onOpenChange={setPreviewFullscreen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" aria-describedby="preview-full-desc">
          <DialogHeader>
            <DialogTitle>Preview em tela cheia</DialogTitle>
            <DialogDescription id="preview-full-desc" className="text-xs text-muted-foreground">
              Variáveis substituídas por exemplos. O coach recebe valores reais.
            </DialogDescription>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
