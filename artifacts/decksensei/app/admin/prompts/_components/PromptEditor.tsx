"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { commands } from "@uiw/react-md-editor";
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

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-border/40 bg-card/30 text-sm text-muted-foreground/60">
      Carregando editor…
    </div>
  ),
});

interface Props {
  gameId: string;
  promptId?: number;
  initialContent?: string;
  initialVersion?: string;
  initialNotes?: string;
  suggestedVersion: string;
  isCurrentlyActive?: boolean;
}

const VARIABLES = [
  {
    key: "game_name",
    label: "Nome do jogo",
    example: "Digimon Card Game",
    description: "Preenchido com o nome completo do jogo",
  },
  {
    key: "game_card_code_pattern",
    label: "Padrão de código de carta",
    example: "BT13-040",
    description: "Formato padrão dos códigos de carta do jogo",
  },
  {
    key: "game_card_code_examples",
    label: "Exemplos de códigos",
    example: "BT01-001, ST1-01",
    description: "Lista de exemplos reais de códigos de cartas",
  },
  {
    key: "game_deck_rules",
    label: "Regras do deck",
    example: "50 cartas no main…",
    description: "Regras de construção de deck do jogo",
  },
  {
    key: "archetypes_context",
    label: "Arquetipos do meta",
    example: "Red Hybrid, Blue Flare…",
    description: "Lista completa dos arquetipos do meta atual",
  },
];

const TOOLBAR_COMMANDS = [
  commands.bold,
  commands.italic,
  commands.divider,
  commands.title2,
  commands.title3,
  commands.divider,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.divider,
  commands.link,
  commands.quote,
];

export default function PromptEditor({
  gameId,
  promptId,
  initialContent = "",
  initialVersion = "",
  initialNotes = "",
  suggestedVersion,
  isCurrentlyActive = false,
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

  // Rastreia última posição do cursor enquanto a textarea está focada
  const lastCursorRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      ".w-md-editor-text-input",
    );
    if (!ta) return;
    const handler = () => {
      if (document.activeElement === ta) {
        lastCursorRef.current = {
          start: ta.selectionStart ?? 0,
          end: ta.selectionEnd ?? 0,
        };
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  // Functional updater evita stale closure; deps vazias
  const insertVariable = useCallback((varKey: string) => {
    const tag = `{{${varKey}}}`;
    const pos = lastCursorRef.current;
    setContent((prev) => {
      if (!pos) return prev + tag;
      return prev.slice(0, pos.start) + tag + prev.slice(pos.end);
    });
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        ".w-md-editor-text-input",
      );
      if (ta && pos) {
        const newPos = pos.start + tag.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
        lastCursorRef.current = { start: newPos, end: newPos };
      }
    });
  }, []);

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

  // Preview com variáveis substituídas por exemplos
  const previewContent = VARIABLES.reduce((acc, v) => {
    return acc.replaceAll(`{{${v.key}}}`, v.example);
  }, content);

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
        <div className="flex flex-col gap-2" data-color-mode="dark">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Editor de prompt
          </p>
          <MDEditor
            value={content}
            onChange={(v) => setContent(v ?? "")}
            preview="edit"
            height={520}
            className="!border-border/40"
            commands={TOOLBAR_COMMANDS}
            extraCommands={[]}
          />
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
              <span className="text-xs text-muted-foreground/60 transition-transform duration-200"
                style={{ transform: varOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                ▲
              </span>
            </button>
            {varOpen && (
              <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-2">
                <p className="text-xs text-muted-foreground/60 leading-snug">
                  Clique em <strong>inserir</strong> para colocar o campo na posição do cursor no editor.
                  O sistema preenche automaticamente antes de enviar ao coach.
                </p>
                <div className="space-y-1.5 mt-3">
                  {VARIABLES.map((v) => (
                    <div
                      key={v.key}
                      className="rounded-lg border border-border/30 bg-background/30 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-foreground leading-snug">
                          {v.label}
                        </p>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertVariable(v.key)}
                          className="shrink-0 rounded-md border border-border/40 bg-card/50 px-2 py-0.5 text-[10px] text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                        >
                          inserir
                        </button>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/50 leading-snug">
                        ex: {v.example}
                      </p>
                    </div>
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
              Variáveis substituídas por exemplos. O coach recebe valores reais.
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
