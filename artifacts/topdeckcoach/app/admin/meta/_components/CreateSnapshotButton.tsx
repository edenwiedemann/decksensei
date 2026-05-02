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
  gameId: string;
  activeSnapshotId: number | null;
  activeSnapshotVersion: string | null;
}

export default function CreateSnapshotButton({ gameId, activeSnapshotId, activeSnapshotVersion }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const suggestedVersion = (() => {
    if (!activeSnapshotVersion) return "v2";
    const m = activeSnapshotVersion.match(/v(\d+)$/);
    return m ? `v${parseInt(m[1]) + 1}` : `${activeSnapshotVersion}-2`;
  })();

  const handleOpen = () => {
    setVersion(suggestedVersion);
    setNotes("");
    setError("");
    setOpen(true);
  };

  const handleCreate = async () => {
    setError("");
    if (!version.trim()) { setError("O campo Versão é obrigatório."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/meta/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          version: version.trim(),
          notes: notes.trim() || undefined,
          copyFromId: activeSnapshotId ?? undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; id?: number };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Erro HTTP ${res.status}`);
      } else {
        setOpen(false);
        router.push(`/admin/meta/${data.id}`);
      }
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={handleOpen} className="bg-primary text-primary-foreground">
        + Criar nova snapshot
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" aria-describedby="create-snap-desc">
          <DialogHeader>
            <DialogTitle>Criar nova snapshot de meta</DialogTitle>
            <DialogDescription id="create-snap-desc" className="text-sm text-muted-foreground">
              {activeSnapshotId
                ? `Vai copiar o conteúdo da snapshot ativa (${activeSnapshotVersion}) como ponto de partida.`
                : "Vai criar uma snapshot nova em branco."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="snap-version" className="text-xs text-muted-foreground">
                Versão <span className="text-red-400">*</span>
              </Label>
              <Input
                id="snap-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder={suggestedVersion}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snap-notes" className="text-xs text-muted-foreground">
                Notas (opcional)
              </Label>
              <Input
                id="snap-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ex: atualização pós-BT21, novos arquetipos adicionados"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={loading} className="bg-primary text-primary-foreground">
              {loading ? "Criando…" : "Criar snapshot"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
