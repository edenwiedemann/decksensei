"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface SnapshotCandidate {
  id: number;
  version: string;
  notes: string | null;
  analyses_count: string;
  n_archetypes: string;
  created_at: string;
}

interface Props {
  gameId: string;
  scope?: string;
  activeVersion: string;
  candidates: SnapshotCandidate[];
}

export default function SnapshotRollbackButton({
  gameId,
  scope = "global",
  activeVersion,
  candidates,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SnapshotCandidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOpen = () => {
    setSelected(null);
    setError("");
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/meta/snapshots/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toId: selected.id,
          toVersion: selected.version,
          fromVersion: activeVersion,
          gameId,
          scope,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Erro HTTP ${res.status}`);
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (candidates.length === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="border-amber-500/40 text-amber-400 hover:border-amber-500/70 hover:bg-amber-950/20"
      >
        ↺ Voltar versão
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!loading) { setOpen(v); setSelected(null); setError(""); } }}>
        <DialogContent className="max-w-lg" aria-describedby="rollback-snap-desc">
          <DialogHeader>
            <DialogTitle>Voltar versão de snapshot</DialogTitle>
            <DialogDescription id="rollback-snap-desc" className="text-sm text-muted-foreground">
              Snapshot ativa atual:{" "}
              <span className="font-mono font-semibold text-foreground">{activeVersion}</span>
              . Selecione uma versão anterior pra ativar.
            </DialogDescription>
          </DialogHeader>

          {/* Lista de candidatos */}
          {!selected ? (
            <div className="flex flex-col gap-2 pt-1">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="group flex items-start justify-between gap-4 rounded-lg border border-border/40 bg-card/40 px-4 py-3 text-left transition-all hover:border-primary/50 hover:bg-card/70"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-foreground group-hover:text-primary">
                      {c.version}
                    </p>
                    {c.notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/60">{c.notes}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground/40">
                      criada em{" "}
                      {new Date(c.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground/50">
                    <span className="tabular-nums">{c.n_archetypes}</span> arquetipos
                    <br />
                    <span className="tabular-nums">{c.analyses_count}</span> análises
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Confirmação */
            <div className="flex flex-col gap-4 pt-1">
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
                Voltar de{" "}
                <span className="font-mono font-bold">{activeVersion}</span>
                {" "}pra{" "}
                <span className="font-mono font-bold">{selected.version}</span>
                {" "}— análises a partir de agora vão usar{" "}
                <span className="font-mono font-bold">{selected.version}</span>.
              </div>
              {error && (
                <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSelected(null); setError(""); }}
                  disabled={loading}
                >
                  ← Voltar
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={loading}
                  className="bg-amber-600 text-white hover:bg-amber-500"
                >
                  {loading ? "Aplicando…" : `↺ Confirmar rollback pra ${selected.version}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
