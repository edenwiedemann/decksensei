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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  snapshotId: number;
  isActive: boolean;
  gameId: string;
  currentVersion: string;
}

export default function SnapshotActions({ snapshotId, isActive, gameId, currentVersion }: Props) {
  const router = useRouter();

  // Save checkpoint
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveVersion, setSaveVersion] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Activate
  const [activateOpen, setActivateOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");

  const handleSaveCheckpoint = async () => {
    setSaveError("");
    if (!saveVersion.trim()) { setSaveError("Versão é obrigatória."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/meta/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          version: saveVersion.trim(),
          notes: saveNotes.trim() || undefined,
          copyFromId: snapshotId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; id?: number };
      if (!res.ok || !data.ok) {
        setSaveError(data.error ?? `Erro HTTP ${res.status}`);
      } else {
        setSaveOpen(false);
        router.push(`/admin/meta/${data.id}`);
      }
    } catch {
      setSaveError("Erro de rede.");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    setActivateError("");
    setActivating(true);
    try {
      const res = await fetch(`/api/admin/meta/snapshots/${snapshotId}/activate`, {
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
      setActivateError("Erro de rede.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setSaveVersion(`${currentVersion}-v2`); setSaveNotes(""); setSaveError(""); setSaveOpen(true); }}
      >
        💾 Salvar checkpoint
      </Button>

      {!isActive && (
        <Button
          size="sm"
          onClick={() => { setActivateError(""); setActivateOpen(true); }}
          className="border-emerald-500/40 bg-transparent text-emerald-400 hover:border-emerald-500/70 hover:bg-emerald-950/30"
          variant="outline"
        >
          ⚡ Ativar esta snapshot
        </Button>
      )}

      {/* Save checkpoint modal */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md" aria-describedby="save-snap-desc">
          <DialogHeader>
            <DialogTitle>Salvar checkpoint</DialogTitle>
            <DialogDescription id="save-snap-desc" className="text-sm text-muted-foreground">
              Cria uma cópia desta snapshot com um nome de versão e notas. A snapshot original continua intacta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Versão <span className="text-red-400">*</span></Label>
              <Input
                value={saveVersion}
                onChange={(e) => setSaveVersion(e.target.value)}
                placeholder="ex: BT21-final"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notas sobre o que mudou</Label>
              <Input
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="ex: adicionei Red Hybrid, ajustei WR do Blue Flare"
              />
            </div>
          </div>
          {saveError && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-400">{saveError}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCheckpoint} disabled={saving} className="bg-primary text-primary-foreground">
              {saving ? "Salvando…" : "💾 Salvar checkpoint"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Activate modal */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent className="max-w-sm" aria-describedby="activate-snap-desc">
          <DialogHeader>
            <DialogTitle>Ativar snapshot "{currentVersion}"?</DialogTitle>
            <DialogDescription id="activate-snap-desc" className="text-sm text-muted-foreground">
              A snapshot ativa atual será desativada. Todas as novas análises usarão este meta.
            </DialogDescription>
          </DialogHeader>
          {activateError && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-400">{activateError}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setActivateOpen(false)}>Cancelar</Button>
            <Button onClick={handleActivate} disabled={activating} className="bg-emerald-600 text-white hover:bg-emerald-500">
              {activating ? "Ativando…" : "⚡ Sim, ativar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
