"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  promptId: number;
  isActive: boolean;
  version: string;
}

export default function PromptRowActions({ promptId, isActive, version }: Props) {
  const router = useRouter();
  const [activateOpen, setActivateOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [activateError, setActivateError] = useState("");

  const handleActivate = async () => {
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
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/admin/prompts/${promptId}/duplicate`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; id?: number };
      if (res.ok && data.ok && data.id) {
        router.push(`/admin/prompts/${data.id}/edit`);
      }
    } catch {
      /* silently fail */
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Link
          href={`/admin/prompts/${promptId}/edit`}
          className="rounded-md border border-border/40 px-2.5 py-1 text-xs text-muted-foreground transition-all hover:border-border/70 hover:text-foreground"
        >
          Ver / Editar
        </Link>

        {!isActive && (
          <button
            type="button"
            onClick={() => setActivateOpen(true)}
            className="rounded-md border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-400 transition-all hover:border-emerald-500/60 hover:bg-emerald-950/20"
          >
            Ativar
          </button>
        )}

        <button
          type="button"
          onClick={handleDuplicate}
          disabled={duplicating}
          className="rounded-md border border-border/40 px-2.5 py-1 text-xs text-muted-foreground transition-all hover:border-border/70 hover:text-foreground disabled:opacity-50"
        >
          {duplicating ? "…" : "Duplicar"}
        </button>
      </div>

      {/* Confirmação de ativação */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent className="max-w-sm" aria-describedby="row-activate-desc">
          <DialogHeader>
            <DialogTitle>Ativar versão "{version}"?</DialogTitle>
            <DialogDescription id="row-activate-desc" className="text-sm text-muted-foreground">
              A versão ativa atual será desativada. Todas as novas análises usarão esta versão.
            </DialogDescription>
          </DialogHeader>
          {activateError && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-400">
              {activateError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setActivateOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleActivate}
              disabled={activating}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {activating ? "Ativando…" : "⚡ Ativar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
