"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  snapshotId: number;
  currentVersion: string;
  gameId: string;
}

export default function ActiveSnapshotBanner({ snapshotId, currentVersion, gameId }: Props) {
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState("");

  const handleDuplicate = async () => {
    setDuplicating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/meta/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          version: `${currentVersion}-v2`,
          notes: "Cópia criada para edição",
          copyFromId: snapshotId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; id?: number };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Erro HTTP ${res.status}`);
      } else {
        router.push(`/admin/meta/${data.id}`);
      }
    } catch {
      setError("Erro de rede.");
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-950/20 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-lg text-amber-400">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-300">
              Snapshot ATIVA — só leitura
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-400/70">
              Pra alterar, duplique pra v2 e ative quando pronto.
              As análises em produção continuam usando esta versão.
            </p>
          </div>
        </div>
        <button
          onClick={handleDuplicate}
          disabled={duplicating}
          className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-300 transition-all hover:border-amber-500/80 hover:bg-amber-950/50 disabled:opacity-50"
        >
          {duplicating ? "Duplicando…" : "⧉ Duplicar pra editar"}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
