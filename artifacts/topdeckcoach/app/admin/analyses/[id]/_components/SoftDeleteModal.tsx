"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  analysisId: string;
}

export default function SoftDeleteModal({ analysisId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const noteOk = note.trim().length >= 10;

  async function handleDelete() {
    if (!noteOk) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/analyses/${analysisId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote: note.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }

      setOpen(false);
      router.push("/admin/analyses");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive/80 transition-colors hover:bg-destructive/10"
      >
        Soft delete
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deletar análise</DialogTitle>
            <DialogDescription>
              A análise ficará oculta mas permanece no banco.
              Esta ação pode ser desfeita manualmente no banco de dados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-note">
                Motivo{" "}
                <span className="text-xs text-muted-foreground">(mín. 10 caracteres)</span>
              </Label>
              <Textarea
                id="admin-note"
                rows={3}
                placeholder="Ex: conteúdo inadequado, teste, duplicata…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="resize-none"
              />
              <p className="text-right text-xs tabular-nums text-muted-foreground/60">
                {note.trim().length}/10 mín.
              </p>
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/80">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={!noteOk || loading}
                onClick={handleDelete}
              >
                {loading ? "Deletando…" : "Confirmar delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
